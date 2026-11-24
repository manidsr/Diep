import type { Powerup } from '../shared/config';

// One icon geometry for world crates and HUD; no external textures or icon library.
type IconPath={points:number[];closed?:boolean};
type Meta={name:string;detail:string;fill:string;edge:string;paths:IconPath[]};
export const POWER_META:Record<Powerup,Meta>={
  damage:{name:'Damage Boost',detail:'+50% damage',fill:'#e86b63',edge:'#a8443f',paths:[{points:[13,2,5,13,11,13,10,22,20,10,14,10],closed:true}]},
  speed:{name:'Speed Boost',detail:'+35% movement speed',fill:'#66bd84',edge:'#387e50',paths:[{points:[3,5,10,12,3,19]},{points:[12,5,19,12,12,19]}]},
  shield:{name:'Shield',detail:'55% less damage',fill:'#649fe0',edge:'#366ca8',paths:[{points:[12,2,21,6,20,14,17,19,12,22,7,19,4,14,3,6],closed:true},{points:[8,12,11,15,16,9]}]},
  rapid:{name:'Rapid Fire',detail:'35% shorter reload',fill:'#b887e7',edge:'#7950a8',paths:[{points:[3,6,13,6,18,9,13,12,3,12],closed:true},{points:[6,15,16,15,21,18,16,21,6,21],closed:true}]},
  heal:{name:'Health',detail:'Restore 35% max HP',fill:'#e6b74f',edge:'#997023',paths:[{points:[9,3,15,3,15,9,21,9,21,15,15,15,15,21,9,21,9,15,3,15,3,9,9,9],closed:true}]},
};
export function drawPowerIcon(ctx:CanvasRenderingContext2D,kind:Powerup,size:number,color:string){
  ctx.save();ctx.scale(size/24,size/24);ctx.translate(-12,-12);
  ctx.strokeStyle=color;ctx.lineWidth=2.3;ctx.lineJoin='round';ctx.lineCap='round';
  for(const {points,closed} of POWER_META[kind].paths){
    ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);if(closed)ctx.closePath();ctx.stroke();
  }
  ctx.restore();
}
export function powerIcon(kind:Powerup):SVGSVGElement{
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.3');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('stroke-linecap','round');svg.setAttribute('aria-hidden','true');
  for(const {points,closed} of POWER_META[kind].paths){
    const p=document.createElementNS(ns,'path');let d='M'+points[0]+' '+points[1];for(let i=2;i<points.length;i+=2)d+='L'+points[i]+' '+points[i+1];if(closed)d+='Z';p.setAttribute('d',d);svg.append(p);
  }
  return svg;
}
