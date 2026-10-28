/** Shape-preserving cubic interpolation of independently recorded hull offsets. */
export function fairValue(xs,ys,x){
  if(x<=xs[0])return ys[0];if(x>=xs.at(-1))return ys.at(-1);
  let i=0;while(xs[i+1]<x)i++;
  const slopes=xs.slice(1).map((v,j)=>(ys[j+1]-ys[j])/(v-xs[j]));
  const tangent=j=>{if(j===0)return slopes[0];if(j===slopes.length)return slopes.at(-1);const a=slopes[j-1],b=slopes[j];if(a*b<=0)return 0;const h0=xs[j]-xs[j-1],h1=xs[j+1]-xs[j],w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/a+w1/b);};
  const h=xs[i+1]-xs[i],t=(x-xs[i])/h;
  return (2*t**3-3*t*t+1)*ys[i]+(t**3-2*t*t+t)*h*tangent(i)+(-2*t**3+3*t*t)*ys[i+1]+(t**3-t*t)*h*tangent(i+1);
}
export function hullOffset(hull,station,u){
  const xs=hull.stations.map(s=>s.at),parameter=hull.parameters;
  const x=fairValue(xs,hull.stations.map(s=>fairValue(parameter,s.points.map(p=>p[0]),u)*s.breadth),station);
  const y=fairValue(xs,hull.stations.map(s=>fairValue(parameter,s.points.map(p=>p[1]),u)),station);
  return {x,y,sheer:fairValue(xs,hull.stations.map(s=>s.sheer),station)};
}

