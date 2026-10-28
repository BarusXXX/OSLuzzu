import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {Brush,Evaluator,SUBTRACTION,INTERSECTION,computeMeshVolume} from 'three-bvh-csg/src/index.js';

import {fairValue,hullOffset} from './hull-loft.mjs';
import {constructionDefaults,decorationDefaults,GENERATOR} from './parametric.mjs';
export {fairValue,hullOffset} from './hull-loft.mjs';

/** Fit mating solids by removing shared volume. Cuts are reconstruction choices, not authenticated joint patterns. */
export function fitJoinery(root) {
  // This library release uses the BVH option's older name; suppress only that known deprecation.
  const warn=console.warn;console.warn=(...args)=>{if(String(args[0]).includes('"maxLeafSize" option has been deprecated'))return;warn(...args);};
  try {
  root.updateMatrixWorld(true);
  const ranks={'scuppers':-1,'keel':0,'forefoot':1,'bow-post':2,'stern-post':2,'transom':2,'planking':3,'sheer-strake':3,'caulking':4,'apron':5,'floor-frames':7,'futtocks':7,'keelson':8,'gunwale':9,'washboards':10,'rubbing-strake':11,'seat-supports':12,'knees':13,'thwarts':14,'floorboards':15,'fore-deck':16,'aft-deck':16,'catwalks':17};
  const evaluator=new Evaluator();evaluator.attributes=['position','normal'];evaluator.useGroups=false;evaluator.useCDTClipping=true;
  const solids=root.children.filter(m=>m.isMesh&&!m.userData.explicitFit&&!['fasteners','caulking'].includes(m.userData.partId)&&(m.userData.closed||m.userData.partId==='scuppers')).sort((a,b)=>(ranks[a.userData.partId]??20)-(ranks[b.userData.partId]??20));
  const fitted=[];let cuts=0;
  for(const mesh of solids){
    mesh.updateMatrix();let brush=new Brush(mesh.geometry.clone().applyMatrix4(mesh.matrix));brush.updateMatrixWorld();
    const bounds=new THREE.Box3().setFromObject(brush),cutters=[];
    for(const other of fitted){
      if(mesh.userData.preserveLoftedSurface)break;
      if(mesh.userData.partId===other.mesh.userData.partId)continue;
      const overlap=bounds.clone().intersect(other.bounds).getSize(new THREE.Vector3());if(Math.min(overlap.x,overlap.y,overlap.z)<.00015)continue;
      const intersection=evaluator.evaluate(brush,other.brush,INTERSECTION),volume=Math.abs(computeMeshVolume(intersection));intersection.geometry.dispose();
      if(volume<1e-8||volume>overlap.x*overlap.y*overlap.z*1.10)continue;
      const next=evaluator.evaluate(brush,other.brush,SUBTRACTION);
      if(!next.geometry.getAttribute('position')?.count)throw new Error(`Joinery removed whole component: ${mesh.name} against ${other.mesh.name}`);
      brush.geometry.dispose();brush=next;brush.updateMatrixWorld();cutters.push(other.mesh.name);cuts++;
    }
    if(cutters.length){
      const geometry=brush.geometry.clone().applyMatrix4(mesh.matrix.clone().invert());geometry.userData={...mesh.geometry.userData,joineryCuts:cutters};
      geometry.normalizeNormals();mesh.geometry.dispose();mesh.geometry=geometry;mesh.userData.joineryCuts=cutters;
    }
    fitted.push({mesh,brush,bounds:new THREE.Box3().setFromObject(brush)});
  }
  fitted.forEach(({brush})=>brush.geometry.dispose());root.userData.joineryCuts=cuts;return cuts;
  } finally {console.warn=warn;}
}

/** Authoring source for the teaching reconstructions. Bow is +Z; one unit is one metre. */
export function buildBoat(boat, detail = 36, fit = true) {
  const root = new THREE.Group();
  root.name = boat.id;
  const L = boat.dimensions.length.value, B = boat.dimensions.beam.value, D = boat.dimensions.depth.value;
  const scale = L / 7.8;
  const profile = boat.geometry ?? {};
  const timberScale = scale * (profile.timberScale ?? 1);
  const construction={...constructionDefaults(boat),...boat.construction};
  const decoration={...decorationDefaults(boat),...boat.decoration};
  const {keelWidth,keelHeight,plankThickness,stemWidth}=construction;
  const hullEnd=L*construction.hullHalfLength,scarfEnd=L*construction.straightKeelHalfLength,scarfLength=L*construction.scarfLength;
  const transom = boat.id === 'kajjik';
  if(!boat.hull)throw new Error(`Missing station record for ${boat.id}`);
  const frameRecords=[...boat.hull.frames].sort((a,b)=>a.at-b.at),frameCount=frameRecords.length;
  const frameZs=frameRecords.map(f=>f.at*hullEnd);
  const materials = new Map();
  const defaults = { hull: '#276e91', upper: '#dfb741', trim: '#ad4436', moustache: '#edbd54', interior: '#926b48', interiorPaint:'#e8dfcb',seats:'#b84937', underwater: '#993f36', brass: '#b59a64', sail: '#e6decc', rope: '#8c795b', eye: '#f6e8c2', pupil: '#172f37', seam:'#3a3024', white:'#f4ead6', iris:'#546e68', steel:'#8e9692' };
  let index = 0;
  const material = (region) => {
    if (!materials.has(region)) {
      const m = new THREE.MeshStandardMaterial({ color: defaults[region], roughness: region === 'brass' ? .35 : .73, metalness: region === 'brass' ? .65 : 0 });
      m.name = region;
      materials.set(region, m);
    }
    return materials.get(region);
  };
  const add = (geometry, partId, layer, region = 'interior', position = [0, 0, 0], closed = true) => {
    let edgeRadius=0;
    if(geometry.userData.development&&['gunwale','rubbing-strake','catwalks'].includes(partId)){
      edgeRadius=.003*scale;const replacement=ribbon(geometry.userData.development,geometry.userData.stockThickness,edgeRadius);geometry.dispose();geometry=replacement;
    }
    const mesh = new THREE.Mesh(geometry, material(region));
    mesh.position.set(...position);
    mesh.name = `${partId}-${index++}`;
    mesh.userData = { partId, layer, finishRegion: region, closed, sourceGeometry: 'educational-reconstruction' };
    if(edgeRadius)mesh.userData.edgeRadius=edgeRadius;
    root.add(mesh);
    return mesh;
  };
  const box = (size, part, layer, region, pos) => {
    const radius=Math.min(.005*scale,Math.min(...size)*.18),g=new RoundedBoxGeometry(...size,2,radius);
    const mesh=add(g,part,layer,region,pos);mesh.userData.edgeRadius=radius;return mesh;
  };
  const beam = (a, b, width, part, layer, region = 'interior') => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = add(new THREE.CylinderGeometry(width / 2, width / 2, start.distanceTo(end), detail>=30?16:12), part, layer, region);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return mesh;
  };
  const cut=(mesh,cutter,feature)=>{
    mesh.updateMatrix();cutter.updateMatrix();
    const evaluator=new Evaluator();evaluator.attributes=['position','normal'];evaluator.useGroups=false;evaluator.useCDTClipping=true;
    const a=new Brush(mesh.geometry.clone().applyMatrix4(mesh.matrix)),b=new Brush(cutter.geometry.clone().applyMatrix4(cutter.matrix));a.updateMatrixWorld();b.updateMatrixWorld();
    const warn=console.warn;let result;console.warn=(...args)=>{if(!String(args[0]).includes('"maxLeafSize" option has been deprecated'))warn(...args);};
    try{result=evaluator.evaluate(a,b,SUBTRACTION);}finally{console.warn=warn;}
    result.geometry.applyMatrix4(mesh.matrix.clone().invert());result.geometry.userData={...mesh.geometry.userData};
    mesh.geometry.dispose();mesh.geometry=result.geometry;mesh.userData.features??=[];mesh.userData.features.push(feature);
    a.geometry.dispose();b.geometry.dispose();cutter.geometry.dispose();
  };
  const bore=(mesh,point,direction,radius,length,label)=>{
    const cutter=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,16));cutter.position.set(...point);cutter.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...direction));
    mesh.updateMatrix();const inverse=mesh.matrix.clone().invert();
    cut(mesh,cutter,{kind:'bore',label,center:new THREE.Vector3(...point).applyMatrix4(inverse).toArray(),axis:new THREE.Vector3(...direction).transformDirection(inverse).toArray(),coordinates:'component-local',diameter:radius*2,depth:length});
  };
  const fastening=(point,direction,diameter,length,kind='bronze-bolt',mates=[])=>{
    const axis=new THREE.Vector3(...direction).normalize(),p=new THREE.Vector3(...point),radius=diameter/2;
    const shaft=beam(p.toArray(),p.clone().addScaledVector(axis,-length).toArray(),diameter,'fasteners','fittings',kind==='treenail'?'interior':'brass');
    shaft.userData.explicitFit=true;shaft.userData.hardware={kind,diameter,length,mates};
    const headRadius=kind==='treenail'?radius:radius*1.6,headDepth=kind==='treenail'?.0006*scale:diameter*.35;
    const head=add(new THREE.CylinderGeometry(headRadius,headRadius,headDepth,kind==='bronze-bolt'?6:16),'fasteners','fittings',kind==='treenail'?'interior':'brass',p.clone().addScaledVector(axis,headDepth*.5).toArray());
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);head.userData.explicitFit=true;head.userData.hardware={kind:`${kind}-head`,diameter:diameter*1.6,mates};
    return shaft;
  };
  function width(z) {
    return Math.abs(section(z,1)[0]);
  }
  function backboneTop(z){
    const rise=THREE.MathUtils.smoothstep(Math.abs(z),scarfEnd,hullEnd);
    return keelHeight+(transom&&z<0?0:D*construction.forefootRise*rise);
  }
  function section(z, v, side = 1) {
    const offset=hullOffset(boat.hull,z/hullEnd,THREE.MathUtils.clamp(v,0,1));
    const bottom = backboneTop(z)-plankThickness*.55;
    const top = D * offset.sheer;
    const endBlend=transom&&z<0?0:THREE.MathUtils.smoothstep(Math.abs(z/hullEnd),.87,1);
    const x=THREE.MathUtils.lerp(B*.5*offset.x,THREE.MathUtils.lerp(keelWidth*.55,stemWidth*.5,v),endBlend);
    return [side*x,bottom+(top-bottom)*offset.y,z];
  }
  function hullPlank(stations,low,high,side){
    const transverse=detail>=30?6:4,k=transverse+1,positions=[],indices=[],uvs=[],development=[];
    for(const z of stations){
      const outer=[],inner=[];
      for(let j=0;j<k;j++){
        const v=low+(high-low)*j/transverse,p=section(z,v,side),a=section(z,Math.max(0,v-.0001),side),b=section(z,Math.min(1,v+.0001),side),dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;
        if(low===0&&j===0)p[0]=side*keelWidth*.55;
        outer.push(p);inner.push([p[0]-side*dy/d*plankThickness,p[1]+Math.abs(dx)/d*plankThickness,z]);
      }
      development.push([outer[0],outer.at(-1)]);
      for(const layer of [outer,inner])for(let j=0;j<k;j++){positions.push(...layer[j]);uvs.push((z+hullEnd)/(hullEnd*2),low+(high-low)*j/transverse);}
    }
    const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
    for(let r=0;r<stations.length-1;r++){
      const row=r*k*2,next=row+k*2;
      for(let j=0;j<k-1;j++){quad(row+j,next+j,next+j+1,row+j+1);quad(row+k+j,row+k+j+1,next+k+j+1,next+k+j);}
      quad(row,row+k,next+k,next);quad(row+k-1,next+k-1,next+2*k-1,row+2*k-1);
    }
    for(let j=0;j<k-1;j++){quad(j,j+1,k+j+1,k+j);const r=(stations.length-1)*2*k;quad(r+j,r+k+j,r+k+j+1,r+j+1);}
    const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    let volume=0;for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i]),b=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i+1]),c=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i+2]);volume+=a.dot(b.cross(c));}
    if(volume<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];g.setIndex(indices);g.computeVertexNormals();}
    g.userData={development,stockThickness:plankThickness};return g;
  }
  // Every ribbon is a closed solid, including end faces, so stencil cuts cap timber only.
  function ribbon(points, thickness, radius=0) {
    if(radius){
      const positions=[],indices=[],cornerSegments=detail>=30?3:2,k=4*(cornerSegments+1);
      for(const [a,b]of points){const start=new THREE.Vector3(...a),across=new THREE.Vector3(...b).sub(start),w=across.length();across.normalize();const inward=new THREE.Vector3(-across.y,across.x,0).normalize();if(inward.x*(a[0]+b[0])>0)inward.negate();
        const r=Math.min(radius,w*.2,thickness*.25),centres=[[r,r,Math.PI],[w-r,r,Math.PI*1.5],[w-r,thickness-r,0],[r,thickness-r,Math.PI*.5]];
        for(const [u,v,angle]of centres)for(let j=0;j<=cornerSegments;j++){const t=angle+j/cornerSegments*Math.PI*.5,p=start.clone().addScaledVector(across,u+r*Math.cos(t)).addScaledVector(inward,v+r*Math.sin(t));positions.push(...p.toArray());}
      }
      for(let row=0;row<points.length-1;row++)for(let j=0;j<k;j++){const a=row*k+j,b=row*k+(j+1)%k,c=b+k,d=a+k;indices.push(a,b,c,a,c,d);}
      // Independent cap vertices keep the end grain and swept edge normals distinct.
      for(const [row,reverse]of [[0,true],[points.length-1,false]]){const base=positions.length/3;for(let j=0;j<k;j++)positions.push(...positions.slice((row*k+j)*3,(row*k+j)*3+3));for(let j=1;j<k-1;j++)indices.push(...(reverse?[base,base+j+1,base+j]:[base,base+j,base+j+1]));}
      const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
      let volume=0;for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i]),b=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i+1]),c=new THREE.Vector3().fromBufferAttribute(g.attributes.position,indices[i+2]);volume+=a.dot(b.cross(c));}
      if(volume<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];g.setIndex(indices);g.computeVertexNormals();}
      g.userData={development:points,stockThickness:thickness,edgeRadius:radius};return g;
    }
    const positions = [], triangles = [];
    points.forEach(([a, b]) => {
      const normal = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
      const inward = new THREE.Vector3(-normal.y, normal.x, 0);
      if (inward.x * (a[0] + b[0]) > 0) inward.negate();
      for (const p of [a, b, [b[0] + inward.x * thickness, b[1] + inward.y * thickness, b[2]], [a[0] + inward.x * thickness, a[1] + inward.y * thickness, a[2]]]) positions.push(...p);
    });
    for (let i = 0; i < points.length - 1; i++) {
      for (let edge = 0; edge < 4; edge++) {
        const a = i * 4 + edge, b = i * 4 + (edge + 1) % 4, c = b + 4, d = a + 4;
        triangles.push(a, b, c, a, c, d);
      }
    }
    const last = (points.length - 1) * 4;
    triangles.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
    const g = new THREE.BufferGeometry();
    g.userData.development = points.map(([a,b])=>[a,b]);
    g.userData.stockThickness=thickness;
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(triangles); g.computeVertexNormals();
    // Correct winding globally by signed volume (some mirrored ribbons have inverted normals).
    let volume = 0;
    const p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < triangles.length; i += 3) {
      a.fromBufferAttribute(p, triangles[i]); b.fromBufferAttribute(p, triangles[i + 1]); c.fromBufferAttribute(p, triangles[i + 2]);
      volume += a.dot(b.cross(c));
    }
    if (volume < 0) { for (let i = 0; i < triangles.length; i += 3) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]]; g.setIndex(triangles); g.computeVertexNormals(); }
    return g;
  }
  const zs = Array.from({ length: detail * 2 + 1 }, (_, i) => -hullEnd + hullEnd * 2 * i / (detail*2));
  // Mating hooked profiles at the ends; forefeet continue the keel into the raised posts.
  const backbone=(coords,part,width=keelWidth,region='interior')=>{
    const shape=new THREE.Shape();coords.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSize:.001*scale,bevelThickness:.001*scale,bevelSegments:2});
    g.applyMatrix4(new THREE.Matrix4().set(0,0,1,-width/2, 0,1,0,0, -1,0,0,0, 0,0,0,1));g.rotateY(Math.PI);
    return add(g,part,'frames',region);
  };
  const end=scarfEnd, hook=scarfLength;
  backbone([[-end,0],[end,0],[end,keelHeight*.42],[end-hook,keelHeight*.42],[end-hook,keelHeight],[ -end+hook,keelHeight],[-end+hook,keelHeight*.42],[-end,keelHeight*.42]],'keel');
  for(const sign of [-1,1]) {
    // A transom stern still needs its aft keel heel. It stays flat instead of rising like the bow.
    const upper=Array.from({length:17},(_,i)=>{const z=end+(hullEnd-end)*i/16;return [z,backboneTop(sign*z)];});
    const lower=upper.slice(1).map(([z,y])=>[z,y-keelHeight]);
    const points=[[end-hook,keelHeight],[end-hook,keelHeight*.42],[end,keelHeight*.42],[end,0],...lower,...[...upper].reverse()].map(([z,y])=>[sign*z,y]);
    const foot=backbone(points,'forefoot');foot.userData.joint={kind:'hooked-scarf',mates:['keel',sign>0?'bow-post':transom?'transom':'stern-post'],length:hook,shoulder:keelHeight*.42};
    const apron=backbone(Array.from({length:14},(_,i)=>{const z=L*.34+(hullEnd-L*.34)*i/13;return [sign*z,backboneTop(sign*z)+.008*scale];}).concat(Array.from({length:14},(_,i)=>{const z=hullEnd-(hullEnd-L*.34)*i/13;return [sign*z,backboneTop(sign*z)+.078*timberScale];})),'apron',keelWidth*1.18);
    apron.userData.joint={kind:'backbone-reinforcement',mates:['keel','forefoot']};
  }
  const postHeight = D * (profile.postHeight ?? (boat.id === 'firilla' ? 2.0 : 1.55));
  function curvedPost(sign, height, id) {
    // Closed extruded timber follows a rising curve; the profile remains an explicit reconstruction.
    const shape = new THREE.Shape(), points = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      const y=t*height;
      const aboveSheer=THREE.MathUtils.smoothstep(y,section(sign*hullEnd,1)[1],height);
      const curved=profile.posts==='curved'&&!(boat.id==='xprunara'&&sign<0);
      return [sign*(hullEnd+construction.postMoulded*.65+(curved?L*construction.postCurve*Math.sin(aboveSheer*Math.PI*.65):0)),y];
    });
    points.forEach(([z,y],i) => i ? shape.lineTo(z,y) : shape.moveTo(z,y));
    [...points].reverse().forEach(([z,y]) => {const heel=L*construction.postHeelFraction*(1-THREE.MathUtils.smoothstep(y,keelHeight,D*.44));shape.lineTo(z-sign*(construction.postMoulded+heel),y);}); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth:stemWidth,bevelEnabled:true,bevelSize:.003*scale,bevelThickness:.002*scale,bevelSegments:3 });
    // Shape coordinates become world Z/Y, extrusion becomes world X.
    geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,-stemWidth/2, 0,1,0,0, -1,0,0,0, 0,0,0,1));
    // Reverse Z to keep the authored bow at +Z, without a negative scale/winding.
    geometry.rotateY(Math.PI);
    const mesh=add(geometry,id,'frames','trim');mesh.userData.edgeRadius=.003*scale;mesh.userData.joint={kind:'full-depth-heeled-post',mates:['keel','forefoot','planking','sheer-strake'],landing:plankThickness,moulded:construction.postMoulded,heelLength:L*construction.postHeelFraction};return mesh;
  }
  curvedPost(1,postHeight,'bow-post');
  if (!transom) curvedPost(-1,profile.posts==='curved'?postHeight*.95:D*1.55,'stern-post');
  else {
    // The transom closes the same transverse hull section as the planks, rather than a rectangular board.
    const z=-hullEnd,shape=new THREE.Shape(),points=[];
    for(const side of [-1,1])for(let i=0;i<=24;i++)points.push(section(z,side<0?1-i/24:i/24,side));
    points.forEach((p,i)=>i?shape.lineTo(p[0],p[1]):shape.moveTo(p[0],p[1]));shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth:.034*scale,bevelEnabled:false}),'transom','planking','hull',[0,0,z]);
    const y=section(z,1)[1],half=width(z);
    box([half*2,.055*scale,.065*scale],'transom','frames','upper',[0,y,z]);
    for(const side of [-1,1])beam([side*half*.66,D*.48,z+.045*scale],[side*half*.94,y-.03,z+.045*scale],.065*scale,'transom','frames','interior');
  }
  const strakes = construction.strakes;
  for (const side of [-1, 1]) {
    for (let j = 0; j < strakes; j++) {
      const low = j / strakes, high = (j + 1) / strakes - construction.seamFraction;
      const id = j === strakes - 1 ? 'sheer-strake' : 'planking';
      const region = transom ? (j<3?'underwater':j===6?'interior':'hull') : j < Math.floor(strakes*.42) ? 'underwater' : j < strakes-1 ? 'hull' : 'upper';
      // Keep butt joints between real frames, including short, reduced-rib proposals.
      const phase=j%3,gaps=[Math.min(6+phase,Math.floor((frameCount-2)*.4)),Math.max(frameCount-8-phase,Math.ceil((frameCount-2)*.6))];
      const seams=gaps.map((gap,i)=>THREE.MathUtils.lerp(frameZs[gap],frameZs[gap+1],gap===(i===0?6+phase:frameCount-8-phase)?.5:.3+phase*.2));
      const ranges=[-hullEnd,...seams,hullEnd],plankPieces=[];
      for(let piece=0;piece<ranges.length-1;piece++){
        const start=ranges[piece]+(piece?.0008*scale:0),finish=ranges[piece+1]-(piece<2?.0008*scale:0),stations=[start,...zs.filter(z=>z>start&&z<finish),finish];
        const plank=add(hullPlank(stations,low,high,side),id,'planking',region);
        plank.userData.paintBands=decoration;
        plankPieces.push(plank);
        plank.userData.preserveLoftedSurface=true;
        plank.userData.joint={kind:'backed-carvel-butt',mates:['floor-frames','futtocks','plank-butt-blocks',side>0?'starboard-stem-rabbet':'port-stem-rabbet'],thickness:plankThickness,seam:.0016*scale};
      }
      if(j>0&&j<strakes-1)for(const z of seams){
        const v=(low+high)/2,p=section(z,v,side),q=section(z,v+.002,side),normal=new THREE.Vector3(q[1]-p[1],-(q[0]-p[0]),0).normalize();if(normal.x*side<0)normal.negate();
        const centre=new THREE.Vector3(...p).addScaledVector(normal,-plankThickness-.016*scale),block=box([.035*scale,(high-low)*D*.90,.17*scale],'plank-butt-blocks','frames','interior',centre.toArray());
        block.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),normal);block.userData.joint={kind:'plank-butt-backing',mates:[id],seamAt:z};
        if(j%2===0)for(const dz of [-.045*scale,.045*scale]){const at=new THREE.Vector3(...section(z+dz,v,side)).addScaledVector(normal,.001*scale);
          const boreCentre=at.clone().addScaledVector(normal,-(plankThickness+.035*scale)/2),boreLength=plankThickness+.055*scale;
          bore(block,boreCentre.toArray(),normal.toArray(),.0028*scale,boreLength,'Butt backing treenail');
          const plank=plankPieces[ranges.findIndex((end,i)=>i>0&&at.z<end)-1];
          if(plank)bore(plank,boreCentre.toArray(),normal.toArray(),.0028*scale,boreLength,'Butt backing treenail');
          const bolt=fastening(at.toArray(),normal.toArray(),.0055*scale,plankThickness+.023*scale,'treenail',[id,'plank-butt-blocks']);bolt.userData.smallHotspot=true;
        }
      }
      if(j>0) add(ribbon(zs.map(z=>[section(z,low-.006,side),section(z,low,side)]),.012*timberScale),'caulking','planking','seam');
    }
    add(ribbon(zs.map(z => { const p = section(z, 1, side); return [p, [p[0], p[1] + .11 * scale, z]]; }), .025 * scale), 'washboards', 'planking', transom?'hull':'trim');
    if(transom){
      add(ribbon(zs.map(z=>{const p=section(z,1,side);return [[p[0]+side*.002,p[1]+.085*scale,z],[p[0]+side*.002,p[1]+.12*scale,z]];}),.025*scale),'washboards','planking','upper');
      for(const [v,region] of [[.735,'white'],[.753,'trim']])add(ribbon(zs.map(z=>[section(z,v,side),section(z,v+.013,side)]),.029*scale),'rubbing-strake','fittings',region);
    }
    // Continuous outer rail plus an inner lip interrupted where the futtocks enter the gunwale.
    const railZs=zs.filter(z=>width(z)>.10*scale);
    const railJoints=[railZs[0],-L*.18,L*.18,railZs.at(-1)];
    for(let piece=0;piece<3;piece++){
      const start=railJoints[piece]+(piece?.0007*scale:0),end=railJoints[piece+1]-(piece<2?.0007*scale:0),stations=[start,...railZs.filter(z=>z>start&&z<end),end];
      const rows=stations.map((z,i)=>{const p=section(z,1,side),a=[p[0]+side*(boat.id==='firilla'?.056:.035)*scale,p[1]-.025,z],b=[p[0]-side*.018*scale,p[1]-.025,z];
        if((i===0&&piece>0)||(i===stations.length-1&&piece<2)){a[2]+=.106*scale;b[2]-=.106*scale;}return [a,b];});
      const rail=add(ribbon(rows,.06*scale),'gunwale','frames',transom?'upper':'interior');rail.userData.joint={kind:'diagonal-scarf',mates:['gunwale','futtocks'],length:.212*scale,seam:.0014*scale};
    }
    const breaks=[railZs[0],...frameZs.flatMap(z=>[z-.032*timberScale,z+.032*timberScale]),railZs.at(-1)];
    for(let i=0;i<breaks.length-1;i+=2) {
      const segment=Array.from({length:4},(_,j)=>breaks[i]+(breaks[i+1]-breaks[i])*j/3);
      if(segment.some(z=>width(z)<.13*scale))continue;
      add(ribbon(segment.map(z=>{const p=section(z,1,side);return [[p[0]-side*.018*scale,p[1]-.025,z],[p[0]-side*.085*scale,p[1]-.025,z]];}),.06*scale),'gunwale','frames','interior');
    }
    add(ribbon(zs.map(z => { const p = section(z, .93, side); return [[p[0] + side * .012, p[1], z], [p[0] + side * .012, p[1] + .04 * scale, z]]; }), .075 * scale), 'rubbing-strake', 'fittings', 'trim');
    const walkZs = zs.filter(z => Math.abs(z) < L * .31);
    add(ribbon(walkZs.map(z => { const p = section(z, 1, side); return [[p[0]-side*.090*scale,p[1]-.025*scale,z], [p[0]-side*.20*scale,p[1]-.025*scale,z]]; }), .025 * scale), 'catwalks', 'decks', 'interior');
  }
  if(decoration.guardStyle!=='plain')for(const side of [-1,1]){
    const start=-L*.30,end=L*.29,guardZs=Array.from({length:49},(_,i)=>start+(end-start)*i/48);
    const edgeHeight=z=>.115*scale+.105*scale*(THREE.MathUtils.smoothstep(Math.abs(z),L*.18,L*.29));
    const crest=add(ribbon(guardZs.map(z=>{const p=section(z,1,side);return [[p[0],p[1]+.11*scale,z],[p[0],p[1]+edgeHeight(z),z]];}),.025*scale),'washboards','planking','hull');crest.userData.explicitFit=true;
    // A rounded painted cap follows the guard's independent decorative edge.
    const curve=new THREE.CatmullRomCurve3(guardZs.map(z=>{const p=section(z,1,side);return new THREE.Vector3(p[0],p[1]+edgeHeight(z),z);}));
    add(new THREE.TubeGeometry(curve,64,.018*scale,8,false),'washboards','planking','upper');
    for(const z of [start,end]){const p=section(z,1,side);const knob=add(new THREE.SphereGeometry(.032*scale,12,10),'washboards','planking','trim',[p[0],p[1]+edgeHeight(z)+.010*scale,z]);knob.scale.y=1.3;}
    if(decoration.guardStyle==='panelled')for(let i=0;i<=6;i++){const z=start+(end-start)*i/6,p=section(z,1,side);box([.035*scale,edgeHeight(z)+.025*scale,.050*scale],'washboards','planking','upper',[p[0]+side*.020*scale,p[1]+edgeHeight(z)/2,z]);}
  }
  // Cut the backbone rabbets from the very plank ends that occupy them, before general fitting.
  for(const timber of root.children.filter(m=>['keel','forefoot','bow-post','stern-post','transom'].includes(m.userData.partId))){
    timber.updateMatrixWorld();const bounds=new THREE.Box3().setFromObject(timber);
    for(const plank of root.children.filter(m=>['planking','sheer-strake'].includes(m.userData.partId))){
      plank.updateMatrixWorld();const overlap=bounds.clone().intersect(new THREE.Box3().setFromObject(plank)).getSize(new THREE.Vector3());if(Math.min(overlap.x,overlap.y,overlap.z)<.0002)continue;
      const cutter=new THREE.Mesh(plank.geometry.clone());cutter.position.copy(plank.position);cutter.quaternion.copy(plank.quaternion);
      cut(timber,cutter,{kind:'rabbet',label:'Plank landing',mate:plank.name,depth:plankThickness});
    }
  }
  const inboard=(z,v,side,offset)=>{
    const p=section(z,v,side),before=section(z,Math.max(0,v-.0001),side),after=section(z,Math.min(1,v+.0001),side);
    const dx=(after[0]-before[0])*side,dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
    return [side*Math.max(0,p[0]*side-dy/length*offset),p[1]+dx/length*offset];
  };
  const frameMember=(z,samples,id,depth,lower=false)=>{
    const thickness=construction.frameMoulded;
    const frameOffset=plankThickness+.0002;
    const outer=samples.map(([v,side])=>inboard(z,v,side,frameOffset));
    const inner=samples.map(([v,side])=>inboard(z,v,side,frameOffset+thickness));
    if(lower)outer.forEach(p=>{if(Math.abs(p[0])<keelWidth*.62)p[1]=Math.max(p[1],keelHeight+.004*scale);});
    if(lower)inner.forEach((p,i)=>{p[1]=Math.max(p[1],outer[i][1]+.014*scale);});
    const shape=new THREE.Shape();[...outer,...inner.slice().reverse()].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const mesh=add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.001*scale,bevelThickness:.0005*scale,bevelSegments:2}),id,'frames','interiorPaint',[0,0,z-depth/2]);
    // Bevel both sided faces to the changing hull, rather than leaving a cylindrical extrusion floating at its edges.
    const positions=mesh.geometry.getAttribute('position'),contour=[...outer,...inner.slice().reverse()],sampleRecords=[...samples.map(([v,side])=>({v,side,offset:frameOffset})),...samples.slice().reverse().map(([v,side])=>({v,side,offset:frameOffset+thickness}))];
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),actualZ=z-depth/2+positions.getZ(i);let closest=0,distance=Infinity;
      for(let j=0;j<contour.length;j++){const d=Math.hypot(x-contour[j][0],y-contour[j][1]);if(d<distance){distance=d;closest=j;}}
      const r=sampleRecords[closest],base=inboard(z,r.v,r.side,r.offset),landing=inboard(actualZ,r.v,r.side,r.offset);
      positions.setXY(i,x+landing[0]-base[0],y+landing[1]-base[1]);
    }
    mesh.geometry.computeVertexNormals();mesh.userData.hullFit={clearance:.0002,method:'station-lofted-sided-face'};
    mesh.userData.joint={kind:'half-lap',mates:[id==='floor-frames'?'futtocks':'floor-frames'],lap:.08,depth:depth/2};return mesh;
  };
  for (let f = 0; f < frameCount; f++) {
    const z = frameZs[f],record=frameRecords[f],overlap=boat.id==='firilla',lapDirection=record.number<12?-1:1;
    const frameDepth=record.sided;
    const floor=frameMember(z,Array.from({length:33},(_,i)=>{const t=(i/32-.5)*1.08;return [Math.abs(t),t<0?-1:1];}),'floor-frames',frameDepth,true);
    floor.userData.frame={...record,z,status:boat.hull.frameStatus};
    const lapY=inboard(z,.46,1,plankThickness+.001*scale)[1];
    const floorRebate=new THREE.Mesh(new THREE.BoxGeometry(B*2,D*3,frameDepth/2+.002*scale));floorRebate.position.set(0,lapY+D*1.5,z+frameDepth/4+.001*scale);
    if(!overlap)cut(floor,floorRebate,{kind:'half-lap',label:'Futtock lap shoulder',depth:frameDepth/2,datumY:lapY});else{floorRebate.geometry.dispose();floor.userData.joint={kind:'nailed-floor-futtock-overlap',mates:['futtocks']};}
    for (const side of [-1, 1]) {
      const futtock=frameMember(z+(overlap?lapDirection*frameDepth:0),Array.from({length:17},(_,i)=>[.46+i/16*.51,side]),'futtocks',frameDepth);
      futtock.userData.frame={...record,z,status:boat.hull.frameStatus};
      const upper=inboard(z,.54,side,plankThickness+.001*scale+.060*timberScale)[1],rebate=new THREE.Mesh(new THREE.BoxGeometry(B*2,D*3,frameDepth/2+.002*scale));rebate.position.set(0,upper-D*1.5,z-frameDepth/4-.001*scale);
      if(!overlap)cut(futtock,rebate,{kind:'half-lap',label:'Floor-frame lap shoulder',depth:frameDepth/2,datumY:upper});else{rebate.geometry.dispose();futtock.userData.joint={kind:'nailed-floor-futtock-overlap',mates:['floor-frames']};}
      if(overlap){
        for(const v of [.475,.505,.535]){const point=inboard(z,v,side,plankThickness+.001*scale+.021),at=[point[0],point[1],z+(lapDirection<0?frameDepth/2:frameDepth*1.5)];
          bore(floor,at,[0,0,1],.0015,.08,'Three-nail frame overlap');bore(futtock,at,[0,0,1],.0015,.08,'Three-nail frame overlap');
          const nail=fastening(at,[0,0,1],.0028,.040,'brass-nail',['floor-frames','futtocks']);nail.userData.smallHotspot=true;
        }
      }else if(f%3===0){
        const point=inboard(z,.505,side,plankThickness+.001*scale+.03*timberScale),at=[point[0],point[1],z+frameDepth/2];
        bore(floor,at,[0,0,1],.004*scale,frameDepth*3,'Frame lap bolt');bore(futtock,at,[0,0,1],.004*scale,frameDepth*3,'Frame lap bolt');
        fastening(at,[0,0,1],.0075*scale,frameDepth+.004*scale,'bronze-bolt',['floor-frames','futtocks']);
      }
    }
  }
  for (let i = -3; i <= 3; i++) {
    if(i===0&&boat.parts.includes('keelson'))continue;
    const x = i * B * .055;
    // Raised above the frame tops; separate boards retain visible seam gaps.
    const masts=boat.parts.includes('mast')?(boat.id==='latini'?[-L*.20,L*.22]:[L*(profile.rig==='sprit'?.16:.17)]):[];
    const cuts=masts.filter(()=>Math.abs(x)-B*.053/2<.070*scale),ranges=[-L*.28,...cuts.flatMap(z=>[z-.075*scale,z+.075*scale]),L*.28].sort((a,b)=>a-b);
    for(let j=0;j<ranges.length-1;j+=2)box([B*.053,.035*scale,ranges[j+1]-ranges[j]],'floorboards','floorboards','interior',[x,D*.43,(ranges[j]+ranges[j+1])/2]);
  }
  for (const z of (boat.id==='midalji'?[-L*.26,L*.03]:[-L * .22, 0, L * .23])) {
    const seatV=.85, p=section(z,seatV,1), seatY=p[1]+.06*scale;
    const bearingY=seatY-.025*scale;
    const atHeight=(q,y,side)=>{let lo=0,hi=1;for(let j=0;j<24;j++){const mid=(lo+hi)/2;if(inboard(q,mid,side,plankThickness)[1]<y)lo=mid;else hi=mid;}return inboard(q,(lo+hi)/2,side,plankThickness);};
    const halfSeat=atHeight(z,bearingY,1)[0]-.002*scale;
    const seat=box([halfSeat*2,.05*scale,.30*scale],'thwarts','decks','seats',[0,seatY,z]);seat.userData.grainAxis='x';seat.userData.joint={kind:'bearing-ledge-and-knee',mates:['seat-supports','knees']};
    for(const side of [-1,1]){
      const x=side*(halfSeat-.036*scale);
      const support=add(ribbon(Array.from({length:13},(_,i)=>{const q=z+(i/12-.5)*.39*scale,top=atHeight(q,bearingY,side),bottom=atHeight(q,bearingY-.10*scale,side);return [[top[0],bearingY,q],[bottom[0],bearingY-.10*scale,q]];}),.075*scale),'seat-supports','frames','interior');
      support.userData.joint={kind:'hull-fitted-bearing-ledge',mates:['thwarts','futtocks'],bearingY};
      const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(.19*scale,0);s.lineTo(0,-.20*scale);s.closePath();
      const k=add(new THREE.ExtrudeGeometry(s,{depth:.05*scale,bevelEnabled:false}),'knees','frames','interiorPaint',[side*(halfSeat-.075*scale),bearingY,z-.025*scale]);if(side===1){k.rotation.y=Math.PI;k.position.z+=.05*scale;}
      for(const dz of [-.095*scale,.095*scale]){const at=[x,seatY+.025*scale,z+dz];bore(seat,at,[0,1,0],.0045*scale,.08*scale,'Seat fixing');bore(support,at,[0,1,0],.0045*scale,.20*scale,'Seat fixing');fastening(at,[0,1,0],.008*scale,.12*scale,'bronze-bolt',['thwarts','seat-supports']);}
    }
  }
  for(const sign of (transom?[1]:[-1,1])){
    const z=sign*L*.447,w=width(z)-.06*scale,y=section(z,1)[1]-.061*scale,tip=sign*(hullEnd-.020*scale),s=new THREE.Shape();
    s.moveTo(-w,0);s.lineTo(w,0);s.lineTo(stemWidth*.52,tip-z);s.lineTo(-stemWidth*.52,tip-z);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:.045*scale,bevelEnabled:true,bevelSize:.002*scale,bevelThickness:.001*scale,bevelSegments:2});g.rotateX(Math.PI/2);
    const knee=add(g,'breasthooks','frames','interior',[0,y,z]);knee.userData.joint={kind:'breasthook',mates:['gunwale',sign>0?'bow-post':'stern-post']};knee.userData.grainAxis='x';
    for(const x of [-w*.65,w*.65]){const at=[x,y,z+sign*.025*scale];bore(knee,at,[0,1,0],.0045*scale,.12*scale,'Breasthook fixing');fastening(at,[0,1,0],.008*scale,.065*scale,'bronze-bolt',['breasthooks','gunwale']);}
  }
  for (const [id, sign] of [['fore-deck', 1], ['aft-deck', -1]]) {
    // End the deck where a usable opening remains between the inner rails.
    let deckEnd=L*.475;while(deckEnd>L*.35&&width(sign*deckEnd)<.13*scale)deckEnd-=L*.001;
    const a = sign * L * .33, b = sign * deckEnd;
    for (let i = 0; i < 9; i++) {
      const z = a + (b - a) * (i + .5) / 9;
      const dz=Math.abs(b-a)/9-.002*scale,stations=Array.from({length:9},(_,j)=>z-dz/2+dz*j/8),edge=e=>Math.max(.003*scale,width(e)-.070*scale);
      const shape=new THREE.Shape(),outline=[...stations.map(e=>[-edge(e),e-z]),...stations.slice().reverse().map(e=>[edge(e),e-z])];
      outline.forEach(([x,q],j)=>j?shape.lineTo(x,q):shape.moveTo(x,q));shape.closePath();
      const g=new THREE.ExtrudeGeometry(shape,{depth:.026*scale,bevelEnabled:true,bevelSize:.001*scale,bevelThickness:.001*scale,bevelSegments:2});g.rotateX(Math.PI/2);
      const p=g.getAttribute('position');for(let j=0;j<p.count;j++)p.setY(j,p.getY(j)+section(z+p.getZ(j),1)[1]-.026*scale);g.computeVertexNormals();
      const board=add(g,id,'decks','interior',[0,0,z]);board.userData.grainAxis='x';board.userData.edgeRadius=.001*scale;board.userData.joint={kind:'fitted-deck-plank',mates:['gunwale',`${id}-bearers`],seam:.002*scale};
      board.geometry.userData.stockProfile=outline;board.geometry.userData.stockThickness=.026*scale;
    }
    // Two deck bearers follow the inboard rail and carry the tapered plank ends.
    for(const side of [-1,1]){
      const deckZs=Array.from({length:17},(_,i)=>a+(b-a)*i/16);
      const bearer=add(ribbon(deckZs.map(z=>{const y=section(z,1)[1]-.054*scale,x=side*Math.max(.030*scale,width(z)-.080*scale);return [[x,y,z],[x-side*.035*scale,y,z]];}),.045*scale),id,'decks','interior');
      bearer.userData.joint={kind:'deck-bearing-ledge',mates:['gunwale',id]};
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [-L * .2, L * .14]) {
      const p = section(z, 1, side);
      const rowY=p[1]+.105*scale;
      const saddle=new THREE.Shape();saddle.moveTo(-.065*scale,-.11*scale);saddle.lineTo(.065*scale,-.11*scale);saddle.lineTo(.065*scale,.11*scale);saddle.lineTo(-.065*scale,.11*scale);saddle.closePath();const bore=new THREE.Path();bore.absarc(0,-.065*scale,.019*scale,0,Math.PI*2,true);saddle.holes.push(bore);
      const saddleGeometry=new THREE.ExtrudeGeometry(saddle,{depth:.04*scale,bevelEnabled:false});saddleGeometry.rotateX(Math.PI/2);add(saddleGeometry,'rowlocks','fittings','interior',[p[0],rowY+.02*scale,z]);
      for(const end of [-1,1]) box([.13*scale,.11*scale,.035*scale],'rowlocks','fittings','interior',[p[0],rowY+.075*scale,z+end*.095*scale]);
      beam([p[0],rowY,z-.065*scale],[p[0],rowY+.19*scale,z-.065*scale],.030*scale,'rowlocks','fittings').userData.smallHotspot=true;
      const strop=add(new THREE.TorusGeometry(.065*scale,.009*scale,5,16),'rowlocks','fittings','rope',[p[0]+side*.028*scale,rowY+.095*scale,z]);strop.rotation.y=Math.PI/2;
    }
    for (const z of [-L * .27, L * .27]) {
      const p = section(z, .94, side);
      // Teaching marker; black recess, not a fictitious added drain fitting.
      const hole = box([.015 * scale, .035 * scale, .08 * scale], 'scuppers', 'fittings', 'pupil', [p[0] + side * .015, p[1], z]);
      hole.userData.smallHotspot = true;
      hole.userData.closed=false;
    }
    // Deploy at the actual rowlocks, above the sheer. The handle never enters the hull shell.
    // Dimensions and stroke mechanism are educational, pending measured oar/rowing records.
    if(boat.parts.includes('oars'))for(const z of (boat.id==='midalji'?[-L*.2,L*.14]:[L*.14])){
      const p=section(z,1,side),pivot=[p[0]+side*.028*scale,p[1]+.200*scale,z];
      const inner=Math.min(B*.36,.72*scale),outer=Math.max(1.8*scale,2.2*(pivot[1]-boat.waterline)+.25*scale),bladeLength=.58*scale,neck=outer-bladeLength;
      const record={id:`oar-${side<0?'port':'starboard'}-${z<0?'aft':'fore'}`,pivot,side,inner,outer,bladeLength,bladeWidth:.17*scale,scale,status:'illustrative-rowing-geometry'};
      const shaft=beam([pivot[0]-side*inner,pivot[1],z],[pivot[0]+side*neck,pivot[1],z],.045*scale,'oars','fittings');
      shaft.userData.rowing={...record,piece:'shaft'};shaft.userData.explicitFit=true;shaft.userData.grainAxis='y';
      const outline=new THREE.Shape();outline.moveTo(neck,-.0225*scale);outline.lineTo(neck+.12*scale,-.075*scale);outline.quadraticCurveTo(outer-.02*scale,-.085*scale,outer,-.06*scale);outline.lineTo(outer,.06*scale);outline.quadraticCurveTo(outer-.02*scale,.085*scale,neck+.12*scale,.075*scale);outline.lineTo(neck,.0225*scale);outline.closePath();
      const g=new THREE.ExtrudeGeometry(outline,{depth:.024*scale,bevelEnabled:true,bevelSize:.002*scale,bevelThickness:.002*scale,bevelSegments:2,curveSegments:12});g.translate(0,0,-.012*scale);
      // Put the blade's butt on the shaft end plane; it is a separate, manufactureable piece.
      for(let i=0;i<g.getAttribute('position').count;i++){const v=g.getAttribute('position');if(v.getX(i)<neck)v.setX(i,neck);}
      g.computeVertexNormals();g.userData.stockProfile=outline.getPoints(24).map(p=>p.toArray());g.userData.stockThickness=.028*scale;
      const blade=add(g,'oars','fittings','interior',pivot);if(side<0)blade.rotation.y=Math.PI;
      blade.userData.rowing={...record,piece:'blade'};blade.userData.explicitFit=true;blade.userData.grainAxis='x';blade.userData.joint={kind:'shaft-to-blade-butt',mates:['oars'],status:'illustrative'};
    }
  }
  if(boat.parts.includes('rudder')) {
    // External hinge axis. The tiller passes above the aft deck and raised stern post.
    root.updateMatrixWorld(true);const sternBounds=new THREE.Box3();root.children.filter(m=>m.userData.partId===(transom?'transom':'stern-post')).forEach(m=>sternBounds.expandByObject(m));
    const stockR=.033*scale,pivot=[0,0,sternBounds.min.z-stockR-.014*scale],sternTop=sternBounds.max.y;
    const tillerY=sternTop+.14*scale, bladeTop=D*.75, bladeBottom=.012*scale;
    const moving=mesh=>{mesh.userData.rudderMoving=true;mesh.userData.rudderPivot=pivot;mesh.userData.explicitFit=true;return mesh;};
    const stock=moving(beam([0,bladeBottom,pivot[2]],[0,tillerY+.045*scale,pivot[2]],stockR*2,'rudder-stock','fittings'));
    const blade=moving(box([.048*scale,bladeTop-bladeBottom,.30*scale],'rudder','fittings','trim',[0,(bladeTop+bladeBottom)/2,pivot[2]-.14*scale]));
    const cheeks=[];
    for(const side of [-1,1])cheeks.push(moving(box([.020*scale,bladeTop-bladeBottom,.30*scale],'rudder-cheeks','fittings','interior',[side*.034*scale,(bladeTop+bladeBottom)/2,pivot[2]-.14*scale])));
    for(const member of [blade,...cheeks]){const cutter=stock.clone();cutter.geometry=stock.geometry.clone();cut(member,cutter,{kind:'round-stock-seat',label:'Fitted rudder-stock seat',diameter:stockR*2});member.userData.joint={kind:'bolted-stock-and-cheek',mates:['rudder-stock','rudder','rudder-cheeks']};}
    for(const [y,z]of [[D*.29,pivot[2]-.010*scale],[D*.62,pivot[2]-.010*scale],[D*.46,pivot[2]-.18*scale]]){
      const at=[.046*scale,y,z];for(const member of [stock,blade,...cheeks])bore(member,at,[1,0,0],.0038*scale,.14*scale,'Rudder cheek through-bolt');
      const start=root.children.length;fastening(at,[1,0,0],.007*scale,.092*scale,'bronze-bolt',['rudder-stock','rudder','rudder-cheeks']);root.children.slice(start).forEach(moving);
      const nut=moving(add(new THREE.CylinderGeometry(.006*scale,.006*scale,.005*scale,6),'fasteners','fittings','brass',[-.047*scale,y,z]));nut.rotation.z=Math.PI/2;
    }
    // Socket is a real hole around the stock, not a beam intersecting it.
    const shape=new THREE.Shape();shape.moveTo(-.07*scale,-.085*scale);shape.lineTo(.07*scale,-.085*scale);shape.lineTo(.040*scale,L*.20);shape.lineTo(-.040*scale,L*.20);shape.closePath();
    const socket=new THREE.Path();socket.absarc(0,0,stockR+.003*scale,0,Math.PI*2,true);shape.holes.push(socket);
    const tiller=new THREE.ExtrudeGeometry(shape,{depth:.045*scale,bevelEnabled:false});tiller.rotateX(Math.PI/2);
    moving(add(tiller,'tiller','fittings','interior',[0,tillerY,pivot[2]]));
    for(const y of [D*.36,D*.72]){
      const ring=add(new THREE.TorusGeometry(.052*scale,.012*scale,8,20),'rudder-hinges','fittings','steel',[0,y,pivot[2]]);ring.rotation.x=Math.PI/2;
      // Two arms connect the fixed eye to the stern; the stock turns freely inside the bore.
      for(const side of [-1,1])beam([side*.052*scale,y,pivot[2]],[side*.052*scale,y,sternBounds.min.z+.006*scale],.018*scale,'rudder-hinges','fittings','steel');
      moving(add(new THREE.TorusGeometry(stockR+.004*scale,.004*scale,6,16),'rudder-hinges','fittings','steel',[0,y+.030*scale,pivot[2]])).rotation.x=Math.PI/2;
    }
  }
  if ((boat.parts.includes('eye') || boat.parts.includes('moustache')) && boat.parts.includes('decoration')) for (const side of [-1, 1]) for (let i = -2; i <= 2; i++) {
    const z = L * i * .1, x = width(z) + .02;
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, (_, j) => new THREE.Vector3(side * x, D * 1.025 + .028 * scale * Math.sin(j / 15 * Math.PI * 2), z + (j / 15 - .5) * .5 * scale)));
    add(new THREE.TubeGeometry(curve, 16, .007 * scale, 4, false), 'decoration', 'fittings', 'moustache', [0, 0, 0], false);
  }
  function sailSolid(vertices, partId) {
    const segments=detail>=30?16:10,positions=[],uvs=[],indices=[],corners=vertices.map(v=>new THREE.Vector3(...v));
    if(vertices.length===3){
      const rows=[];let index=0;
      for(let i=0;i<=segments;i++){rows[i]=[];for(let j=0;j<=segments-i;j++){rows[i][j]=index++;const p=corners[0].clone().multiplyScalar(1-(i+j)/segments).addScaledVector(corners[1],i/segments).addScaledVector(corners[2],j/segments);positions.push(...p.toArray());uvs.push(i/segments,j/segments);}}
      for(let i=0;i<segments;i++)for(let j=0;j<segments-i;j++){indices.push(rows[i][j],rows[i+1][j],rows[i][j+1]);if(j<segments-i-1)indices.push(rows[i+1][j],rows[i+1][j+1],rows[i][j+1]);}
    }else{
      for(let i=0;i<=segments;i++)for(let j=0;j<=segments;j++){const u=i/segments,v=j/segments,p=corners[0].clone().multiplyScalar((1-u)*(1-v)).addScaledVector(corners[1],(1-u)*v).addScaledVector(corners[2],u*v).addScaledVector(corners[3],u*(1-v));positions.push(...p.toArray());uvs.push(u,v);}
      for(let i=0;i<segments;i++)for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
    const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.userData.artwork=vertices.map(v=>[v[2],v[1]]);
    const mesh=add(geometry,partId,'rigging','sail',[0,0,0],false);mesh.material.side=THREE.DoubleSide;
    mesh.userData.sailCloth={corners:vertices,pinnedEdges:[[0,1]],minimumY:Math.min(...vertices.map(v=>v[1]))-.03*scale};
    return mesh;
  }
  if (boat.parts.includes('keelson')) {
    box([.14 * scale, .12 * scale, L * .85], 'keelson', 'frames', 'interior', [0, D * .30, 0]);
  }
  const mastBase=z=>{
    const stepY=boat.parts.includes('keelson')?D*.30+.06*scale:keelHeight+.075*scale,stepTop=stepY+.075*scale,tenon=.060*scale;
    const step=box([.23*scale,.15*scale,.48*scale],'mast-step','frames','interior',[0,stepY,z]);
    const socket=new THREE.Mesh(new THREE.BoxGeometry(tenon+.002*scale,.11*scale,tenon+.002*scale));socket.position.set(0,stepTop-.035*scale,z);
    cut(step,socket,{kind:'mortise',label:'Mast heel socket',width:tenon+.002*scale,length:tenon+.002*scale,depth:.090*scale});
    step.userData.joint={kind:'mortise-and-tenon',mates:['mast','keelson'],clearance:.002*scale};
    const heel=box([tenon,.085*scale,tenon],'mast','rigging','interior',[0,stepTop-.044*scale,z]);heel.userData.explicitFit=true;heel.userData.joint={kind:'mast-heel-tenon',mates:['mast-step']};
    for(const x of [-.080*scale,.080*scale]){const at=[x,stepTop,z];bore(step,at,[0,1,0],.005*scale,.23*scale,'Mast-step bolt');const keelson=root.children.find(m=>m.userData.partId==='keelson');if(keelson)bore(keelson,at,[0,1,0],.005*scale,.45*scale,'Mast-step bolt');fastening(at,[0,1,0],.009*scale,.21*scale,'bronze-bolt',['mast-step','keelson']);}
    const partnerY=D*.94,partner=box([Math.max(.34*scale,width(z)*1.78),.085*scale,.24*scale],'mast-partners','frames','interior',[0,partnerY,z]);
    bore(partner,[0,partnerY,z],[0,1,0],.071*scale,.18*scale,'Mast partners bore');partner.userData.joint={kind:'wedged-mast-partners',mates:['mast','gunwale'],bore:.142*scale};
    for(const side of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(side*.061*scale,-.038*scale);shape.lineTo(side*.066*scale,-.038*scale);shape.lineTo(side*.083*scale,.055*scale);shape.lineTo(side*.061*scale,.055*scale);shape.closePath();
      const wedge=add(new THREE.ExtrudeGeometry(shape,{depth:.070*scale,bevelEnabled:true,bevelSize:.0006*scale,bevelThickness:.0006*scale,bevelSegments:2}),'mast-partners','frames','interior',[0,partnerY,z-.035*scale]);wedge.userData.explicitFit=true;wedge.userData.joint={kind:'removable-packing-wedge',mates:['mast','mast-partners']};
      const cutter=wedge.clone();cutter.geometry=wedge.geometry.clone();cut(partner,cutter,{kind:'wedge-pocket',label:'Tapered removable packing seat',depth:.070*scale,width:.022*scale});
    }
    return stepTop;
  };
  if (boat.id === 'latini' || profile.rig === 'lateen-single') {
    const single = profile.rig === 'lateen-single';
    for (const z of (single ? [L * .17] : [-L * .20, L * .22])) {
      const mastTop = D + L * (single ? .60 : .54);
      const foot=mastBase(z);const mast=beam([0,foot,z],[0,mastTop,z],.11*scale,'mast','rigging');mast.userData.explicitFit=true;mast.userData.joint={kind:'stepped-and-partnered-mast',mates:['mast-step','mast-partners']};
      const rear=z<0,clothX=.155*scale,rigPivot=[0,0,z];
      const a = [clothX, D * 1.35, single?-L*.31:rear?-L*.45:L*.03], b = [clothX, mastTop + L * .11, single?L*.34:rear?-L*.01:L*.40], c = [clothX, D * 1.4, single?L*.45:rear?-L*.01:L*.45];
      mast.userData.rigPivot=rigPivot;
      beam(a.map((n,i)=>i===0?n-.055*scale:n),b.map((n,i)=>i===0?n-.055*scale:n),.08*scale,'yard','rigging').userData.rigPivot=rigPivot;
      const sail=sailSolid([a,b,c],'sail');sail.userData.sailCloth.masts=[{z,radius:.066*scale}];sail.userData.sailCloth.spars=[{a:a.map((n,i)=>i===0?n-.055*scale:n),b:b.map((n,i)=>i===0?n-.055*scale:n),radius:.045*scale}];
      sail.userData.rigPivot=rigPivot;
      for (const side of [-1, 1]) beam([0, mastTop * .85, z], [side * B * .43, D, z - L * .12], .012 * scale, 'rigging', 'rigging', 'rope');
      beam(b, c, .012 * scale, 'rigging', 'rigging', 'rope').userData.rigPivot=rigPivot;
    }
  }
  if (profile.rig === 'sprit') {
    const z = L * .16, top = D + L * .45,rigPivot=[0,0,L*.16];
    const foot=mastBase(z);const mast=beam([0,foot,z],[0,top,z],.11*scale,'mast','rigging');mast.userData.explicitFit=true;mast.userData.joint={kind:'stepped-and-partnered-mast',mates:['mast-step','mast-partners']};
    mast.userData.rigPivot=rigPivot;
    const aft=-L*.37,fore=aft+L*construction.cabinLengthFraction,half=B*construction.cabinBeamFraction/2,roofY=D*.96+construction.cabinHeight,arch=.14*scale;
    const canopyPoint=(u,t)=>[u*half,roofY-arch*u*u,aft+(fore-aft)*t];
    root.updateMatrixWorld(true);const deckMeshes=root.children.filter(m=>m.userData.partId==='aft-deck');
    for(const roofZ of [aft,fore]){
      for(const side of [-1,1]){
        const x=side*half*.94,landing=new THREE.Raycaster(new THREE.Vector3(x,D*2,roofZ),new THREE.Vector3(0,-1,0)).intersectObjects(deckMeshes)[0],baseY=landing?.point.y??D*.94;
        const support=beam([x,baseY+.055*scale,roofZ],[x,roofY-arch*.94*.94-.024*scale,roofZ],.035*scale,'passenger-shelter','decks');support.userData.joint={kind:'seated-awning-stanchion',mates:['aft-deck','passenger-shelter']};
        box([.090*scale,.055*scale,.090*scale],'passenger-shelter','decks','interior',[x,baseY+.0275*scale,roofZ]);
      }
      const bow=new THREE.CatmullRomCurve3(Array.from({length:25},(_,i)=>{const p=canopyPoint(-1+i/12,roofZ===aft?0:1);p[1]-=.012*scale;return new THREE.Vector3(...p);}));
      const roofBow=add(new THREE.TubeGeometry(bow,32,.012*scale,8,false),'passenger-shelter','decks','interior');roofBow.userData.closed=false;
    }
    for(let band=0;band<6;band++)add(ribbon(Array.from({length:17},(_,i)=>[canopyPoint(-1+band/3,i/16),canopyPoint(-1+(band+1)/3,i/16)]),.002*scale),'passenger-shelter','decks','sail',[0,0,0],false).material.side=THREE.DoubleSide;
    root.userData.passengerCabin={aft,fore,half,roofY,status:'image-guided-reconstruction'};
    const clothX=.185*scale,a=[clothX,D*1.40,z], b=[clothX,top,z], c=[clothX,top+L*.05,-L*.22], d=[clothX,roofY+.30*scale,-L*.25];
    const spritA=[.105*scale,D*1.38,z],spritB=[.105*scale,c[1]-.018*scale,c[2]];
    const spritsail=sailSolid([a,b,c,d],'spritsail');spritsail.userData.sailCloth.masts=[{z,radius:.066*scale}];spritsail.userData.sailCloth.spars=[{a:spritA,b:spritB,radius:.045*scale}];
    spritsail.userData.rigPivot=rigPivot;
    spritsail.userData.sailCloth.obstacles=[{min:[-half,D*.72,aft],max:[half,roofY,fore],clearance:.045*scale}];
    const sprit=beam(spritA,spritB,.08*scale,'sprit','rigging');sprit.userData.explicitFit=true;sprit.userData.joint={kind:'lashed-sprit-heel',mates:['mast','rigging']};
    sprit.userData.rigPivot=rigPivot;
    const jibTop=[clothX,top*.9,z], jibBow=[clothX,D*1.42,L*.45], jibFoot=[clothX,D*1.35,L*.22];
    const jib=sailSolid([jibTop,jibBow,jibFoot],'jib');jib.userData.sailCloth.masts=[{z,radius:.066*scale}];
    const rope=(points,system,diameter=.009*scale)=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=add(new THREE.TubeGeometry(curve,Math.max(16,points.length*8),diameter/2,6,false),'rigging','rigging','rope',[0,0,0],false);m.userData.explicitFit=true;m.userData.rigging={system,attachmentPoints:points};
      if(['luff-lacing','sprit-heel-strop','peak-lashing'].includes(system))m.userData.rigPivot=rigPivot;
      if(system==='sprit-halyard'||system==='mainsheet')m.userData.rigLine={pivot:rigPivot,points,weights:system==='sprit-halyard'?[0,1,1,1,0]:[1,1,0,0],radius:diameter/2};
      return m;};
    const block=(point,system)=>{
      const shape=new THREE.Shape();shape.moveTo(-.038*scale,-.055*scale);shape.lineTo(.038*scale,-.055*scale);shape.lineTo(.038*scale,.055*scale);shape.lineTo(-.038*scale,.055*scale);shape.closePath();const hole=new THREE.Path();hole.absarc(0,0,.024*scale,0,Math.PI*2,true);shape.holes.push(hole);
      const g=new THREE.ExtrudeGeometry(shape,{depth:.032*scale,bevelEnabled:true,bevelSize:.002*scale,bevelThickness:.002*scale,bevelSegments:2});g.rotateY(Math.PI/2);
      const housing=add(g,'rigging','rigging','interior',[point[0]-.016*scale,point[1],point[2]]);housing.userData.explicitFit=true;housing.userData.rigging={system,kind:'bored-block-shell'};
      housing.userData.rigPivot=rigPivot;
      const sheave=add(new THREE.CylinderGeometry(.021*scale,.021*scale,.012*scale,20),'rigging','rigging','brass',point);sheave.rotation.z=Math.PI/2;sheave.userData.explicitFit=true;sheave.userData.rigging={system,kind:'separate-sheave'};
      sheave.userData.rigPivot=rigPivot;
      return point;
    };
    for(let i=0;i<12;i++){
      const y=a[1]+(b[1]-a[1])*(i+.3)/12,hoop=add(new THREE.TorusGeometry(.061*scale,.003*scale,6,20),'rigging','rigging','rope',[0,y,z]);hoop.rotation.x=Math.PI/2;hoop.userData.explicitFit=true;hoop.userData.rigging={system:'mast-hoops',kind:'luff-hoop'};
      hoop.userData.rigPivot=rigPivot;
      rope([[.064*scale,y,z],[clothX-.004*scale,y,z]],'luff-lacing',.006*scale);
    }
    const headBlock=block([.12*scale,top-.12*scale,z-.09*scale],'sprit-halyard'),sparPoint=new THREE.Vector3(...spritA).lerp(new THREE.Vector3(...spritB),.60).toArray(),spritBlock=block([sparPoint[0]+.06*scale,sparPoint[1],sparPoint[2]],'sprit-halyard');
    rope([[.22*scale,D*1.10,z-.15*scale],headBlock,spritBlock,[headBlock[0]+.022*scale,headBlock[1],headBlock[2]],[.25*scale,D*1.10,z-.15*scale]],'sprit-halyard');
    rope([[.060*scale,spritA[1]-.03*scale,z],spritA,[.060*scale,spritA[1]+.03*scale,z]],'sprit-heel-strop',.012*scale);
    rope([spritB,c],'peak-lashing',.007*scale);rope([jibTop,jibBow],'jib-luff');
    const clewBlock=block([d[0]+.06*scale,d[1]-.06*scale,d[2]],'mainsheet');
    rope([d,clewBlock,[B*.35,roofY+.12*scale,-L*.28],[B*.35,D*1.02,-L*.38]],'mainsheet',.012*scale);
    rope([jibFoot,[B*.35,D*1.06,z-L*.03]],'jib-sheet');
    rope([[0,top*.90,z],[0,D*1.54,L*.48]],'forestay',.012*scale);
    for(const side of [-1,1])rope([[side*.060*scale,top*.88,z],[side*B*.42,D*1.02,z-L*.10]],'shroud',.012*scale);
  }
  if(boat.parts.includes('canopy-frame')){
    // One fair descending ridge follows the visitor's marked outline to the bow.
    const aft=L*construction.canvasAftFraction,fore=L*construction.canvasForeFraction;
    const seatY=section(aft+L*.04,.85)[1]+.085*scale,rowsCount=detail>=30?65:41;
    const ridge=seatY+construction.canvasSeatedHeight,tipY=section(fore,1)[1]+.125*scale+construction.canvasBowClearance;
    const supportTs=Array.from({length:construction.canvasFrameCount},(_,i)=>i/(construction.canvasFrameCount-1)*.88);
    const ridgeY=t=>THREE.MathUtils.lerp(ridge,tipY,t)-construction.canvasRidgeSag*Math.sin(t*Math.PI);
    const roofPoint=(u,t)=>{
      const z=aft+(fore-aft)*t,span=width(z)-.025*scale,eave=section(z,1)[1]+.125*scale;
      const nearest=Math.min(...supportTs.map(s=>Math.abs(s-t))),belly=Math.min(1,nearest*12)*Math.sin(Math.abs(u)*Math.PI);
      const fold=.005*scale*Math.sin(t*Math.PI*18+u*3)*belly*Math.sin(t*Math.PI);
      return [u*span,THREE.MathUtils.lerp(ridgeY(t),eave,Math.abs(u))-.018*scale*belly+fold,z];
    };
    // Closed bent tubes retain their end faces in sections and fabrication profiles.
    const tube=(points,radius,part,region='steel')=>{
      const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments=Math.max(20,points.length*2),radial=8;
      const g=new THREE.TubeGeometry(curve,segments,radius,radial,false),positions=Array.from(g.attributes.position.array),indices=Array.from(g.index.array);
      for(const [ring,t,reverse]of [[0,0,true],[segments,1,false]]){
        const base=positions.length/3;positions.push(...curve.getPointAt(t).toArray());
        for(let j=0;j<radial;j++)indices.push(...(reverse?[base,ring*(radial+1)+j,ring*(radial+1)+j+1]:[base,ring*(radial+1)+j+1,ring*(radial+1)+j]));
      }
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
      const mesh=add(g,part,'canopy',region);mesh.userData.explicitFit=true;return mesh;
    };
    const ridgeRadius=.012*scale,bowRadius=.009*scale;
    const ridgePoints=Array.from({length:rowsCount},(_,i)=>{const p=roofPoint(0,i/(rowsCount-1));p[1]-=ridgeRadius+.002;return p;});
    const ridgeRail=tube(ridgePoints,ridgeRadius,'canopy-frame');
    ridgeRail.userData.joint={kind:'continuous-descending-tent-ridge',mates:['canopy-frame','canopy-cover']};
    const railMeshes=root.children.filter(m=>m.userData.partId==='gunwale');root.updateMatrixWorld(true);
    for(const t of supportTs){
      const z=aft+(fore-aft)*t,peak=roofPoint(0,t);peak[1]-=ridgeRadius+.002;
      for(const side of [-1,1]){
        const rail=section(z,1,side),edge=roofPoint(side,t),footX=edge[0]-side*.020*scale;
        const landing=new THREE.Raycaster(new THREE.Vector3(footX,rail[1]+.5,z),new THREE.Vector3(0,-1,0)).intersectObjects(railMeshes)[0];
        // Inner rail lips are interrupted at the frames; a socket must bridge that gap at rail-top height.
        const railTop=rail[1]-.025+(side<0?.06*scale:0);
        const landingY=Math.max(landing?.point.y??railTop,railTop),foot=[footX,landingY+.012*scale,z];
        const bowPoints=[foot,[foot[0],landingY+.040*scale,z],...Array.from({length:13},(_,i)=>{
          const u=side*(1-i/12),p=roofPoint(u,t),pitch=(ridgeY(t)-edge[1])/(Math.abs(edge[0])||1);
          p[0]-=side*.018*scale*Math.abs(u);
          p[1]-=bowRadius*Math.sqrt(1+pitch*pitch)+.002;return p;
        })];
        bowPoints[bowPoints.length-1]=peak;
        const bow=tube(bowPoints,bowRadius,'canopy-frame');
        cut(bow,new THREE.Mesh(ridgeRail.geometry.clone()),{kind:'ridge-saddle',label:'Bow fitted beneath continuous ridge',mate:ridgeRail.name});
        bow.userData.joint={kind:'bent-tent-bow',mates:['canopy-frame','gunwale'],station:t,foot};
        const socket=box([.045*scale,.060*scale,.060*scale],'canopy-frame','canopy','steel',[foot[0],landingY+.030*scale+.0003,z]);
        socket.userData.explicitFit=true;socket.userData.joint={kind:'removable-tent-socket',mates:['gunwale',bow.name]};
        bore(socket,[foot[0],landingY+.030*scale,z],[0,1,0],bowRadius+.0005,.14*scale,'Tent-bow socket');
        const top=roofPoint(side,t),tieEnd=[rail[0],rail[1]-.02,z+(t===0?.045:-.045)*L];
        const tie=beam(top,tieEnd,.007*scale,'canopy-ties','canopy','rope');tie.userData.explicitFit=true;
        const lashing=add(new THREE.TorusGeometry(.014*scale,.003*scale,6,16),'canopy-ties','canopy','rope',top);lashing.rotation.y=Math.PI/2;lashing.userData.explicitFit=true;
      }
    }
    const forward=beam(ridgePoints.at(-1),[0,section(fore,1)[1]+.02*scale,fore+.02*scale],.007*scale,'canopy-ties','canopy','rope');forward.userData.explicitFit=true;
    const seatedClearance=roofPoint(.20/(width(aft+L*.04)-.025*scale),L*.04/(fore-aft))[1]-seatY;
    const canopyRecord={form:'continuous-descending-gunwale-tent',seatDatum:seatY,seatedClearance,seatedWidth:.4,aft,fore,supportStations:supportTs,ridge:ridgePoints,eaves:[-1,1].map(u=>Array.from({length:rowsCount},(_,i)=>roofPoint(u,i/(rowsCount-1))))};
    root.userData.canopy=canopyRecord;
    for(let band=0;band<6;band++){
      const rows=Array.from({length:rowsCount},(_,i)=>[roofPoint(-1+band/3,i/(rowsCount-1)),roofPoint(-1+(band+1)/3,i/(rowsCount-1))]);
      const fabric=add(ribbon(rows,.002*scale),'canopy-cover','canopy','sail',[0,0,0],false);fabric.material.side=THREE.DoubleSide;fabric.userData.canopy={form:canopyRecord.form,seatedClearance,seatDatum:seatY};
    }
    for(const u of [-1,0,1]){
      const hem=tube(Array.from({length:rowsCount},(_,i)=>roofPoint(u,i/(rowsCount-1))),.004*scale,'canopy-cover','sail');hem.userData.closed=false;
    }
    const metal=materials.get('steel');metal.metalness=.7;metal.roughness=.45;
    materials.get('sail').color.set('#e7e4d6');
  }
  // Calibrate the reconstruction's overall length and maximum breadth to its record.
  if(fit)fitJoinery(root);
  // Hull depth remains a vertical hull measurement, excluding raised posts and rigging.
  for(const mesh of root.children.filter(m=>m.userData.paintBands)){
    // Recreate continuous paint coordinates after drilling, independently of individual plank seams.
    const p=mesh.geometry.getAttribute('position'),uv=[];
    for(let i=0;i<p.count;i++){const z=p.getZ(i);let lo=0,hi=1;for(let j=0;j<20;j++){const v=(lo+hi)/2;if(section(z,v)[1]<p.getY(i))lo=v;else hi=v;}uv.push((z+hullEnd)/(hullEnd*2),(lo+hi)/2);}
    mesh.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  }
  if(boat.parts.includes('eye')||boat.parts.includes('moustache')){
    // Sample resolved outer plank faces, including their UV chart, after fitting.
    const planks=root.children.filter(m=>m.userData.paintBands),triangles={1:[],'-1':[]},buckets={1:new Map(),'-1':new Map()};
    for(const plank of planks){
      const g=plank.geometry,pos=g.getAttribute('position'),uv=g.getAttribute('uv'),idx=g.index,count=idx?.count??pos.count;
      for(let i=0;i<count;i+=3){
        const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j),p=ids.map(j=>new THREE.Vector3().fromBufferAttribute(pos,j)),q=ids.map(j=>new THREE.Vector2().fromBufferAttribute(uv,j));
        const side=Math.sign(p[0].x),normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize(),area=(q[1].x-q[0].x)*(q[2].y-q[0].y)-(q[1].y-q[0].y)*(q[2].x-q[0].x);
        if(normal.x*side<.02||Math.abs(area)<1e-12)continue;
        const tri={p,q,normal,area};triangles[side].push(tri);
        const us=q.map(v=>v.x),vs=q.map(v=>v.y);
        for(let u=Math.floor(Math.min(...us)*64);u<=Math.floor(Math.max(...us)*64);u++)for(let v=Math.floor(Math.min(...vs)*32);v<=Math.floor(Math.max(...vs)*32);v++){const key=u+','+v,list=buckets[side].get(key)??[];list.push(tri);buckets[side].set(key,list);}
      }
      plank.userData.bowPaint={start:.83,end:1,drop:.50};
    }
    const sample=(u,v,side)=>{
      const list=buckets[side].get(Math.floor(u*64)+','+Math.floor(v*32))??[];
      for(const tri of list){const [a,b,c]=tri.q,w1=((u-a.x)*(c.y-a.y)-(v-a.y)*(c.x-a.x))/tri.area,w2=((b.x-a.x)*(v-a.y)-(b.y-a.y)*(u-a.x))/tri.area,w0=1-w1-w2;
        if(Math.min(w0,w1,w2)>=-1e-7)return {point:tri.p[0].clone().multiplyScalar(w0).addScaledVector(tri.p[1],w1).addScaledVector(tri.p[2],w2),normal:tri.normal};
      }
      throw new Error('The eye extends beyond a plank or across an open seam. Move it inward or reduce its size.');
    };
    if(boat.parts.includes('moustache'))for(const side of [-1,1]){
      // Selectable paint film taken directly from plank triangles; no background plaque.
      const points=[],uvs=[],upper=u=>decoration.bands[1].height+decoration.bands[1].curve*Math.cos(u*Math.PI*2),lower=u=>upper(u)-.50*Math.pow(THREE.MathUtils.clamp((u-.83)/.17,0,1),.8);
      const clip=(polygon,distance)=>{const out=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a.uv),db=distance(b.uv);if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const at=da/(da-db);out.push({p:a.p.clone().lerp(b.p,at),uv:a.uv.clone().lerp(b.uv,at)});}}return out;};
      for(const tri of triangles[side]){
        let polygon=tri.p.map((p,i)=>({p,uv:tri.q[i]}));for(const distance of [uv=>uv.x-.83,uv=>1-uv.x,uv=>uv.y-lower(uv.x),uv=>upper(uv.x)-uv.y])polygon=clip(polygon,distance);
        for(let i=1;i<polygon.length-1;i++)for(const vertex of [polygon[0],polygon[i],polygon[i+1]]){points.push(...vertex.p.clone().addScaledVector(tri.normal,.00015).toArray());uvs.push(vertex.uv.x,vertex.uv.y);}
      }
      const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();
      const film=add(g,'moustache','planking','moustache',[0,0,0],false);film.userData.surfaceFinish={kind:'paint-on-planking',offset:.00015,pickingOnly:true};film.userData.explicitFit=true;
    }
    if(boat.parts.includes('eye'))for(const side of [-1,1]){
      const e=decoration.eye,u=(e.station+1)/2,v=e.v,delta=.00005;
      const along=sample(u+delta,v,side).point.sub(sample(u-delta,v,side).point).multiplyScalar(1/(2*delta)),across=sample(u,v+delta,side).point.sub(sample(u,v-delta,side).point).multiplyScalar(1/(2*delta)),U=along.length(),V=across.length();
      const surface=(x,y,z)=>{const at=sample(u-x/U,v+y/V,side);return at.point.addScaledVector(at.normal,z+.0002);};
      const shape=commands=>{const s=new THREE.Shape();for(const [method,...args]of commands)s[method](...args.map((value,i)=>value*(i%2?e.height:e.width)));return s;};
      for(const design of ['black-brow','red-outline','yellow-brow']){
        const relief=(outline,region,base,depth,piece,round=false,warpY)=>{
          const bevel=round?Math.min(.00065*scale,depth/4):0,source=new THREE.ExtrudeGeometry(outline,{depth:depth-2*bevel,steps:1,curveSegments:detail>=30?18:12,bevelEnabled:!!bevel,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3});source.translate(0,0,base+bevel);
          const p=source.getAttribute('position'),coords=[];
          const triangle=(a,b,c,n)=>{if(n&&Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))>.008*scale){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);triangle(a,ab,ca,n-1);triangle(ab,b,bc,n-1);triangle(ca,bc,c,n-1);triangle(ab,bc,ca,n-1);}else for(const at of [a,b,c])coords.push(...surface(at.x,warpY?warpY(at.x,at.y):at.y,at.z).toArray());};
          for(let i=0;i<p.count;i+=3)triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j)),6);
          source.dispose();if(side<0)for(let i=0;i<coords.length;i+=9)for(let j=0;j<3;j++)[coords[i+3+j],coords[i+6+j]]=[coords[i+6+j],coords[i+3+j]];
          const raw=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(coords,3)),g=mergeVertices(raw,.000001);raw.dispose();g.computeVertexNormals();g.userData.artwork=outline.getPoints(36).map(p=>[p.x,warpY?warpY(p.x,p.y):p.y]);
          const m=add(g,'eye','fittings',region);m.userData.eyeDesign=design;m.userData.explicitFit=true;m.userData.relief={kind:'sculpted-oculus',piece,mountUV:[u,v],mountNormal:sample(u,v,side).normal.toArray(),depth,base,width:e.width,height:e.height};m.material=m.material.clone();m.material.roughness=.35;if(depth<.001*scale){m.material.polygonOffset=true;m.material.polygonOffsetFactor=-1;m.material.polygonOffsetUnits=-1;}return m;
        };
        const body=shape([['moveTo',-.52,-.12],['bezierCurveTo',-.56,.16,-.48,.50,-.28,.53],['bezierCurveTo',.02,.58,.13,.16,.36,-.09],['quadraticCurveTo',.48,-.22,.58,-.10],['quadraticCurveTo',.59,-.38,.32,-.43],['bezierCurveTo',.00,-.44,-.40,-.39,-.52,-.12],['closePath']]);
        const bodyDepth=e.relief*.54,paint=.00025*scale;
        relief(body,design==='red-outline'?'trim':'pupil',0,bodyDepth,'body',true);
        const white=shape([['moveTo',-.46,-.11],['bezierCurveTo',-.28,.10,-.06,.08,.17,-.12],['bezierCurveTo',-.04,-.30,-.33,-.29,-.46,-.11],['closePath']]);
        relief(white,'eye',bodyDepth,paint,'sclera');
        const circle=(r,x=-.17,y=-.115)=>{const s=new THREE.Shape();s.absellipse(x*e.width,y*e.height,r*e.width,r*e.width*.80,0,Math.PI*2,false,0);return s;};
        relief(circle(.080),'iris',bodyDepth+paint,paint,'iris');
        relief(circle(.042),'pupil',bodyDepth+2*paint,.0006*scale,'pupil',true);
        const brow=shape([['moveTo',-.49,.09],['bezierCurveTo',-.45,.36,-.42,.51,-.28,.50],['bezierCurveTo',-.06,.55,.10,.24,.25,.02],['lineTo',.20,-.035],['bezierCurveTo',.02,.18,-.13,.43,-.30,.39],['quadraticCurveTo',-.41,.34,-.43,.06],['closePath']]);
        relief(brow,design==='yellow-brow'?'moustache':'pupil',bodyDepth,e.relief-bodyDepth,'eyebrow',true);
        const lip=shape([['moveTo',-.38,-.29],['bezierCurveTo',-.18,-.40,.21,-.42,.48,-.31],['lineTo',.46,-.34],['bezierCurveTo',.19,-.47,-.18,-.43,-.39,-.31],['closePath']]);
        relief(lip,'trim',bodyDepth,paint,'lower-rim');
        if(design==='black-brow')for(let j=0;j<6;j++){
          const x=-.38+j*.10,mark=shape([['moveTo',x+.04,.15],['quadraticCurveTo',x-.024,.42,x+.005,.83],['lineTo',x+.018,.87],['quadraticCurveTo',x-.004,.42,x+.052,.20],['closePath']]),edge=brow.getPoints(72);
          const warpY=(x,y)=>{const crossings=[];for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];if(x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x)&&Math.abs(b.x-a.x)>1e-9)crossings.push(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x));}const lo=Math.min(...crossings),hi=Math.max(...crossings);return lo+(hi-lo)*(y/e.height);};
          relief(mark,'white',e.relief,.0005*scale,'brow-carving-'+(j+1),false,warpY);
        }
      }
    }
  }

  const dimensionParts=['keel','forefoot','bow-post','stern-post','transom','planking','sheer-strake','washboards','gunwale','rubbing-strake'];
  const bounds = new THREE.Box3();root.children.filter(m=>dimensionParts.includes(m.userData.partId)).forEach(m=>bounds.expandByObject(m));const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  root.scale.set(B / size.x, 1, L / size.z);
  root.position.z = -center.z * root.scale.z;
  root.updateMatrixWorld(true);
  root.userData = { ...root.userData, units: 'metres', bow: '+Z', variant: boat.variant, reconstruction: true,generator:{...GENERATOR},parameterRecord:boat.parametricRecord??null,dimensionParts, dimensionBasis: 'Calibrated hull length and breadth including posts and rails; rig, oars and rudder overhangs are excluded. Depth is the midship hull reference, not draft or overall height.' };
  const sections=Array.from({length:65},(_,i)=>{
    const z=-hullEnd+hullEnd*2*i/64;
    const points=Array.from({length:33},(_,j)=>{const p=section(z,j/32,1);return [p[0]*root.scale.x,p[1]];});
    return {z:z*root.scale.z+root.position.z,points};
  });
  const columns=[];
  for(let i=0;i<32;i++) {
    const z=-hullEnd+hullEnd*2*(i+.5)/32,w=width(z),top=section(z,1,1)[1];
    for(let j=0;j<12;j++) {
      const x=-w+2*w*(j+.5)/12;let low=0,high=1;for(let k=0;k<18;k++){const mid=(low+high)/2;if(section(z,mid)[0]<Math.abs(x))low=mid;else high=mid;}const v=(low+high)/2;
      columns.push({x:x*root.scale.x,z:z*root.scale.z+root.position.z,bottom:section(z,v,1)[1],top,area:(2*w*root.scale.x/12)*(hullEnd*2*root.scale.z/32)});
    }
  }
  root.userData.hullData={sections,columns,frames:frameRecords.map(f=>({...f,z:f.at*hullEnd*root.scale.z+root.position.z,sided:f.sided*root.scale.z})),sourceStations:boat.hull.stations.map(s=>({at:s.at,z:s.at*hullEnd*root.scale.z+root.position.z,points:Array.from({length:33},(_,i)=>{const p=section(s.at*hullEnd,i/32);return [p[0]*root.scale.x,p[1]];})})),bounds:{minX:-B/2,maxX:B/2,minZ:sections[0].z,maxZ:sections.at(-1).z},waterline:boat.waterline};
  return root;
}

/** @param {import('./types').Boat | null} boat */
export function buildWorkshop(lessonId, step, boat = null) {
  const root = new THREE.Group(); root.name = `workshop-${lessonId}`;
  const wood = new THREE.MeshStandardMaterial({ color: '#a57b50', roughness: .85 });
  const add = (g, m, pos = [0, 0, 0], partId = lessonId) => { const o = new THREE.Mesh(g, m); o.position.set(...pos); o.userData.partId = partId; o.castShadow = true; root.add(o); return o; };
  if (lessonId === 'caulking') {
    add(new THREE.BoxGeometry(1.0, .25, 2.7), wood, [-.56, .18, 0], 'planking');
    add(new THREE.BoxGeometry(1.0, .25, 2.7), wood, [.56, .18, 0], 'planking');
    if (step >= 1) {
      const hemp = new THREE.MeshStandardMaterial({ color: '#c9b58c', roughness: 1 });
      for (let i = 0; i < 5; i++) {
        const curve = new THREE.CatmullRomCurve3(Array.from({ length: 30 }, (_, j) => new THREE.Vector3(.027 * Math.sin(j * 2 + i), .11 + i * .025, -1.3 + j / 29 * 2.6)));
        add(new THREE.TubeGeometry(curve, 48, .014, 5, false), hemp);
      }
    }
    if (step >= 2) add(new THREE.BoxGeometry(.12, .035, 2.68), new THREE.MeshStandardMaterial({ color: '#302b26' }), [0, .278, 0]);
    if (step >= 3) add(new THREE.BoxGeometry(2.12, .012, 2.7), new THREE.MeshStandardMaterial({ color: '#276e91', roughness: .5 }), [0, .315, 0], 'planking');
  } else if (lessonId === 'galvu') {
    // Flat template following the selected hull's transverse proportions, never a circular tube.
    // This is explicitly not an authenticated family galvu; its profile can be replaced by evidence.
    const ratio=boat ? boat.dimensions.depth.value/boat.dimensions.beam.value : .43;
    const ps=Array.from({length:41},(_,i)=>{const u=Math.abs(i/40-.5)*2,p=boat?.hull?hullOffset(boat.hull,0,u):{x:u,y:u*u};return [(i<20?-1:1)*p.x*1.4,.16+p.y*2.8*ratio];});
    const template=new THREE.Shape();ps.forEach(([x,y],i)=>i?template.lineTo(x,y):template.moveTo(x,y));
    [...ps].reverse().forEach(([x,y])=>template.lineTo(x*.93,y+.10));template.closePath();
    add(new THREE.ExtrudeGeometry(template,{depth:.07,bevelEnabled:false}),wood,[0,0,0]);
    add(new THREE.BoxGeometry(.11,.32,.12),wood,[0,.17,0]);
    add(new THREE.BoxGeometry(2.8,.065,.09),wood,[0,.16+2.8*ratio*.7,0]);
    const pencil=new THREE.MeshStandardMaterial({color:'#493626'});
    for(let i=-4;i<=4;i++){const u=Math.abs(i)/5,q=boat?.hull?hullOffset(boat.hull,0,u):{x:u,y:u*u};add(new THREE.BoxGeometry(.006,.06,.004),pencil,[(i<0?-1:1)*q.x*1.4,.19+q.y*2.8*ratio,.073]);}
    if(step>=1)add(new THREE.ExtrudeGeometry(template,{depth:.10,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:'#cdb17f'}),[0,0,.38],'floor-frames');
    if(step>=2)for(let i=0;i<8;i++){
      const side=i<4?-1:1,u=(i%4+.5)/4,q=boat?.hull?hullOffset(boat.hull,0,u):{x:u,y:u*u},r=boat?.hull?hullOffset(boat.hull,0,Math.min(1,u+.005)):{x:u+.005,y:(u+.005)**2},x=side*q.x*1.4,y=.14+q.y*2.8*ratio;
      const m=add(new THREE.BoxGeometry(.32,.04,1.25),new THREE.MeshStandardMaterial({color:'#327d88'}),[x,y,.65],'planking');m.rotation.z=side*Math.atan2((r.y-q.y)*2.8*ratio,(r.x-q.x)*1.4);
    }
  } else {
    add(new THREE.BoxGeometry(2.8, .10, 1.1), new THREE.MeshStandardMaterial({ color: '#276e91' }), [0, .12, 0], 'planking');
    if (step >= 1) for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(-1.25 + i / 39 * 2.5, .178, side * .23 + Math.sin(i / 39 * Math.PI * 4) * .08)));
      add(new THREE.TubeGeometry(curve, 48, .012, 5, false), new THREE.MeshStandardMaterial({ color: '#e9bc58' }));
    }
    if (step >= 2) for (let i = -3; i <= 3; i++) {
      const circle = new THREE.Mesh(new THREE.CircleGeometry(.055, 12), new THREE.MeshStandardMaterial({ color: '#e9bc58', side: THREE.DoubleSide }));
      circle.rotation.x = -Math.PI / 2; circle.position.set(i * .35, .181, 0); circle.userData.partId = 'decoration'; root.add(circle);
    }
  }
  return root;
}
