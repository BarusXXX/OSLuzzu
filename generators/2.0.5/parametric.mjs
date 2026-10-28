/** Shared input contract for the authoring tool, asset generator and contribution records. */
export const GENERATOR = Object.freeze({id:'os-luzzu-timber-loft',version:'2.0.5',interpolation:'shape-preserving-cubic',units:'metres',up:'+Y',bow:'+Z'});
export const SCHEMA_VERSION=1;
const copy=value=>JSON.parse(JSON.stringify(value));
export function decorationDefaults(boat){const scale=boat.dimensions.length.value/7.8;return {guardStyle:boat.id==='kajjik'?'panelled':['luzzu','pass'].includes(boat.id)?'knobbed':'plain',bands:[{region:'underwater',height:.22,curve:.028},{region:'hull',height:.66,curve:-.035},{region:'trim',height:.76,curve:.055},{region:'moustache',height:1,curve:0}],pinstripe:.008,eye:{width:.12*scale,height:.067*scale,station:.84,v:.56,relief:.011*scale}};}
export function constructionDefaults(boat){
  const scale=boat.dimensions.length.value/7.8,timber=scale*(boat.geometry?.timberScale??1),firilla=boat.id==='firilla';
  return {keelWidth:firilla?.04:.085*timber,keelHeight:firilla?.08:.11*timber,plankThickness:firilla?.015:.025*Math.max(.45,timber),stemWidth:Math.max(firilla?.04:.085*timber,.12*timber),postMoulded:firilla?.070:.115*timber,postHeelFraction:.055,frameMoulded:firilla?.042:.060*timber,strakes:firilla?5:8,seamFraction:.006,hullHalfLength:.485,straightKeelHalfLength:.405,scarfLength:.025,forefootRise:.25,postCurve:.018,canvasSeatedHeight:1.55,canvasAftFraction:-.37,canvasForeFraction:.455,canvasRidgeSag:.035,canvasBowClearance:.045,canvasFrameCount:4,cabinLengthFraction:.15,cabinBeamFraction:.48,cabinHeight:.7*scale};
}
export function createParameterRecord(boat,contentVersion){
  return {format:'os-luzzu-parametric-boat',schemaVersion:SCHEMA_VERSION,generator:{...GENERATOR},boatType:boat.id,baseVariant:boat.variant,contentVersion,revision:1,status:'local-proposal',parameters:{dimensions:Object.fromEntries(Object.entries(boat.dimensions).map(([k,d])=>[k,d.value])),hull:copy(boat.hull),geometry:copy(boat.geometry??{}),construction:{...constructionDefaults(boat),...boat.construction},decoration:{...decorationDefaults(boat),...boat.decoration},waterline:boat.waterline,parts:[...boat.parts]},provenance:{author:'',specimen:'',placeAndPeriod:'',method:'reconstruction',sources:[],notes:'',permissionToReview:false}};
}
export function parameterErrors(record,boats){
  const errors=[],add=s=>errors.push(s),finite=(v,low,high)=>typeof v==='number'&&Number.isFinite(v)&&v>=low&&v<=high;
  if(!record||typeof record!=='object')return ['A JSON object is required.'];
  if(record.format!=='os-luzzu-parametric-boat'||record.schemaVersion!==SCHEMA_VERSION)add('Unsupported parameter record format or schema version.');
  if(record.generator?.id!==GENERATOR.id||record.generator?.version!==GENERATOR.version)add('This generator version is unsupported; preserve the original and use a matching generator.');
  if(record.generator?.units!=='metres'||record.generator?.up!=='+Y'||record.generator?.bow!=='+Z')add('Coordinates must use metres, Y up and bow +Z.');
  const boat=boats.find(b=>b.id===record.boatType);if(!boat)add('Unknown boat type.');
  if(typeof record.baseVariant!=='string'||!record.baseVariant.trim())add('The source variant is required.');
  if(!Number.isInteger(record.revision)||record.revision<1||record.status!=='local-proposal')add('A positive revision and local-proposal status are required.');
  const p=record.parameters;if(!p||typeof p!=='object')return [...errors,'Parameters are required.'];
  for(const [key,range]of Object.entries({length:[2,30],beam:[.5,10],depth:[.2,5]}))if(!finite(p.dimensions?.[key],...range))add(`Invalid ${key} in metres.`);
  if(p.dimensions?.beam>=p.dimensions?.length||p.dimensions?.depth>=p.dimensions?.beam)add('Dimensions must satisfy depth < beam < length.');
  if(!finite(p.waterline,0,p.dimensions?.depth??0))add('Waterline must be within the hull depth.');
  const h=p.hull;
  if(!h||!Array.isArray(h.parameters)||!Array.isArray(h.stations)||!Array.isArray(h.frames))add('Hull parameters, stations and frames are required.');
  else{
    if(h.parameters.length<5||h.parameters.length>41||h.parameters[0]!==0||h.parameters.at(-1)!==1||h.parameters.some((v,i)=>!finite(v,0,1)||(i&&v<=h.parameters[i-1])))add('Section parameters must increase from 0 to 1 (5–41 ordinates).');
    if(h.stations.length<5||h.stations.length>61||h.stations[0]?.at!==-1||h.stations.at(-1)?.at!==1)add('Use 5–61 longitudinal stations, beginning at -1 and ending at +1.');
    h.stations.forEach((s,i)=>{if(!finite(s.at,-1,1)||(i&&s.at<=h.stations[i-1].at)||!finite(s.breadth,.001,1.1)||!finite(s.sheer,.5,2)||!Array.isArray(s.points)||s.points.length!==h.parameters.length||s.points.some((q,j)=>!Array.isArray(q)||q.length!==2||!finite(q[0],0,1.2)||!finite(q[1],0,1)||(j&&q[1]<s.points[j-1][1]))||s.points[0]?.[1]!==0||s.points.at(-1)?.[1]!==1)add(`Invalid station S${i+1}: check position, breadth, sheer and bottom-to-sheer ordinates.`);});
    if(h.frames.length<5||h.frames.length>100)add('Use 5–100 individually positioned frames.');
    const numbers=new Set();h.frames.forEach((f,i)=>{if(!Number.isInteger(f.number)||f.number<1||numbers.has(f.number)||!finite(f.at,-.985,.985)||!finite(f.sided,.012,.12))add(`Invalid frame ${i+1}: use a unique number, a hull position and a sided dimension in metres.`);numbers.add(f.number);});
    const sorted=[...h.frames].sort((a,b)=>a.at-b.at),length=p.dimensions?.length??0;
    for(let i=1;i<sorted.length;i++)if((sorted[i].at-sorted[i-1].at)*length*(p.construction?.hullHalfLength??.485)<(sorted[i].sided+sorted[i-1].sided)/2+.002)add(`Frames ${sorted[i-1].number} and ${sorted[i].number} overlap or lack clearance.`);
    if(!['reconstructed-offsets','measured-offsets'].includes(h.status)||!['source-constrained','reconstructed','measured'].includes(h.frameStatus))add('Hull and frame evidence status is required.');
    for(const key of ['basis','frameBasis'])if(!h[key]||typeof h[key].en!=='string'||typeof h[key].mt!=='string')add(`Bilingual ${key} is required.`);
    if(!Array.isArray(h.citations))add('Keep the hull citations array.');
  }
  const c=p.construction??{};
  const ranges={keelWidth:[.015,.5],keelHeight:[.025,.5],plankThickness:[.008,.1],stemWidth:[.02,.6],postMoulded:[.035,.5],postHeelFraction:[.015,.075],frameMoulded:[.02,.2],strakes:[3,20],seamFraction:[.0001,.025],hullHalfLength:[.45,.49],straightKeelHalfLength:[.2,.44],scarfLength:[.01,.1],forefootRise:[0,.6],postCurve:[0,.05],canvasSeatedHeight:[.8,2],canvasAftFraction:[-.44,-.2],canvasForeFraction:[.25,.47],canvasRidgeSag:[0,.15],canvasBowClearance:[.025,.2],canvasFrameCount:[2,8],cabinLengthFraction:[.08,.2],cabinBeamFraction:[.3,.6],cabinHeight:[.25,2]};
  for(const [key,range]of Object.entries(ranges))if(!finite(c[key],...range))add(`Invalid construction parameter ${key}.`);
  if(!Number.isInteger(c.strakes)||c.straightKeelHalfLength>=c.hullHalfLength||c.seamFraction>=1/c.strakes)add('Check strake count, seam width and keel lengths.');
  if(!Number.isInteger(c.canvasFrameCount)||c.canvasForeFraction>=c.hullHalfLength||c.canvasRidgeSag*Math.PI>=c.canvasSeatedHeight*.5)add('Check tent support count, bow extent and ridge sag.');
  const d=p.decoration;if(!d||!['plain','knobbed','panelled'].includes(d.guardStyle)||!finite(d.pinstripe,.001,.03)||!Array.isArray(d.bands)||d.bands.length!==4||d.bands.some((b,i)=>b.region!==['underwater','hull','trim','moustache'][i]||!finite(b.height,0,1)||!finite(b.curve,-.1,.1)||(i&&b.height-b.curve<=d.bands[i-1].height-d.bands[i-1].curve)))add('Invalid paint-band curves or guard style.');
  const e=d?.eye;if(!e||!finite(e.width,.03,.5)||!finite(e.height,.015,.3)||!finite(e.station,.5,.94)||!finite(e.v,.1,.9)||!finite(e.relief,.002,.04)||e.height>=e.width)add('Invalid bow-eye size, hull coordinates or relief depth.');
  if(!p.geometry||!finite(p.geometry.timberScale??1,.3,3)||!finite(p.geometry.postHeight??1.55,1,4)||!['straight','curved'].includes(p.geometry.posts??'straight')||!['none','sprit','lateen-single'].includes(p.geometry.rig??'none'))add('Unsupported geometry profile.');
  if(!Array.isArray(p.parts)||!boat||p.parts.length!==boat.parts.length||p.parts.some(id=>!boat.parts.includes(id)))add('Preserve this boat type’s component identities.');
  const v=record.provenance;
  if(!v||!['author','specimen','placeAndPeriod','notes'].every(k=>typeof v[k]==='string')||!['reconstruction','measured-survey','artisan-template','oral-account'].includes(v.method)||!Array.isArray(v.sources)||v.sources.some(s=>typeof s!=='string')||typeof v.permissionToReview!=='boolean')add('Complete the provenance record.');
  return errors;
}
export function boatFromParameters(record,boats){
  const errors=parameterErrors(record,boats);if(errors.length)throw new Error(errors.join('\n'));
  const b=copy(boats.find(b=>b.id===record.boatType)),p=copy(record.parameters);
  for(const key of ['length','beam','depth']){b.dimensions[key].value=p.dimensions[key];b.dimensions[key].status='estimated';b.dimensions[key].citations=[];}
  Object.assign(b,{hull:p.hull,geometry:p.geometry,construction:p.construction,decoration:p.decoration,waterline:p.waterline,parts:p.parts,parametricRecord:copy(record)});
  return b;
}
/** A redistribution is an explicit proposed schedule, never a claim about historic frame count. */
export function redistributeFrames(record,count){
  if(!Number.isInteger(count)||count<5||count>100)throw new Error('Frame count must be 5–100.');
  const h=record.parameters.hull,old=h.frames,front=Math.max(...old.map(f=>f.at)),back=Math.min(...old.map(f=>f.at)),sided=old.reduce((n,f)=>n+f.sided,0)/old.length;
  h.frames=Array.from({length:count},(_,i)=>({number:i+1,at:front+(back-front)*i/(count-1),sided}));h.frameStatus='reconstructed';
}
