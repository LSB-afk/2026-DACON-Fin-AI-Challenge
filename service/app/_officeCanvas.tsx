"use client";

/** Architectural cutaway. Canvas owns drawing/interpolation only; business state is always props. */
import { useEffect, useRef } from "react";
import {
  WORLD, HUB, BUILDINGS, FURNITURE, DECOR, STATION_SPOTS, QUEUE_SPOTS,
  CUSTOMER_SPOTS, COUNSELOR_SPOT, ARCHIVE_SPOT, walkPath, standTile,
  type Point, type Building, type Furniture,
} from "@/lib/officeWorld";
import { project, roomPolygon } from "@/lib/officeProjection";
import { customerDest, type AgentState, type CustomerState } from "@/lib/officeActors";
import {
  advanceMoverAndCombine, createOfficeMotion, officeActivityTelemetry, tickOfficeMotion,
  type MotionMover, type OfficeMotionState, type StaffActivityKind,
} from "@/lib/officeMotion";

export type Camera = { scale: number; tx: number; ty: number };
export type QueueCase = { id: string; badge: string; kind: string };
export type OfficeCanvasProps = {
  statuses: Record<string, "완료" | "대기" | "미연결" | "중단" | "차단" | null>;
  agents: Record<string, AgentState>;
  customer: { state: CustomerState; badge: string } | null;
  queue: QueueCase[];
  docTarget: string | null;
  /** Concurrent observed handoffs. No independent timing or invented processing stages. */
  docTargets?: readonly string[];
  transfers?: readonly { id: string; from: string; to: string; label: string }[];
  runKey?: string;
  activeStation: string | null;
  gateOpen: boolean;
  selectedBuilding?: string | null;
  selectedAgent?: string | null;
  camera: Camera;
  cssSize: { w: number; h: number };
  reducedMotion: boolean;
  /** Presentation-only office life. It never changes status, progress, or requests. */
  ambientMotion?: boolean;
};

type Ctx = CanvasRenderingContext2D;
type DrawItem = { depth: number; draw: (c: Ctx) => void };
type SceneMotion = { key: string; customer: MotionMover; docs: Record<string, MotionMover> };
const COLORS = {
  ink: "#294456", blue: "#006EDA", wood: "#BC9873", woodLight: "#D7B899",
  metal: "#8095A1", paper: "#FCFCF7", screen: "#213F53", sage: "#7F9E88",
};
const MATERIAL = {
  wood: { floor: "#EAE0D1", seam: "#DCCDB9", wall: "#F2ECE1", accent: "#B69570" },
  sage: { floor: "#E0E7DE", seam: "#D4DDD2", wall: "#EFF3E9", accent: "#789489" },
  blue: { floor: "#DBE7EB", seam: "#CDDCE2", wall: "#ECF4F6", accent: "#6388A0" },
  stone: { floor: "#E4E7EA", seam: "#D5DCE0", wall: "#F3F5F5", accent: "#8295A5" },
};
const colorCache = new Map<string, string>();
function shade(hex: string, factor: number): string {
  const key = `${hex}:${factor}`, cached = colorCache.get(key);
  if (cached) return cached;
  const n = parseInt(hex.slice(1), 16);
  const value = "#" + [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(Math.max(0, Math.min(255, v * factor))).toString(16).padStart(2, "0")).join("");
  colorCache.set(key, value); return value;
}
function polygon(c: Ctx, points: readonly Point[], fill: string, stroke?: string, width = 0.8) {
  c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function plane(c: Ctx, x: number, y: number, w: number, h: number, z: number, fill: string, stroke?: string) {
  polygon(c, [project(x,y,z), project(x+w,y,z), project(x+w,y+h,z), project(x,y+h,z)], fill, stroke);
}
function box(c: Ctx, x: number, y: number, w: number, h: number, z: number, height: number, color: string, edge = false) {
  const a=project(x,y,z+height), b=project(x+w,y,z+height), d=project(x,y+h,z+height), e=project(x+w,y+h,z+height);
  const b0=project(x+w,y,z), d0=project(x,y+h,z), e0=project(x+w,y+h,z);
  const line = edge ? shade(color,.76) : undefined;
  polygon(c,[d,e,e0,d0],shade(color,.81),line,.5);
  polygon(c,[b,e,e0,b0],shade(color,.67),line,.5);
  polygon(c,[a,b,e,d],color,line,.5);
}
function line(c: Ctx, points: Point[], color: string, width = 1) {
  c.beginPath(); points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
  c.strokeStyle=color; c.lineWidth=width; c.stroke();
}
function floorEllipse(c: Ctx, x: number, y: number, rx: number, ry: number, color: string, z = 0) {
  const pts = Array.from({length:32},(_,i)=>project(x+Math.cos(i*Math.PI/16)*rx,y+Math.sin(i*Math.PI/16)*ry,z));
  polygon(c,pts,color);
}
/** Fixed upper-left light; every object uses the same projected ground shadow. */
function contactShadow(c: Ctx, x: number, y: number, w: number, h: number, tall = 1) {
  polygon(c,[project(x,y),project(x+w,y),project(x+w+.45*tall,y+h+.4*tall),project(x+.35*tall,y+h+.4*tall)],"rgba(44,63,67,.13)");
}
function plant(c: Ctx, x: number, y: number, w = 0.8) {
  contactShadow(c,x,y,w,w,1.7);
  box(c,x+.1,y+.1,w-.15,w-.15,0,.65,"#E1E1CF",true);
  plane(c,x+.18,y+.18,w-.31,w-.31,.66,"#7A6550");
  box(c,x+w/2-.07,y+w/2-.07,.14,.14,.55,1.5,"#94775C");
  const leaves = [[.12,.14,1.1,.68],[.45,.18,1.35,.65],[.18,.46,1.55,.66],[.43,.44,1.8,.58],[.25,.28,2.05,.5]];
  for (const [dx,dy,z,s] of leaves) {
    const p=project(x+dx,y+dy,z), r=s*13;
    polygon(c,[{x:p.x,y:p.y-r*.8},{x:p.x+r,y:p.y-r*.12},{x:p.x+r*.65,y:p.y+r*.58},{x:p.x-r*.72,y:p.y+r*.42},{x:p.x-r,y:p.y-r*.3}],z>1.6?"#91AD85":"#749771");
    polygon(c,[{x:p.x,y:p.y-r*.8},{x:p.x+r,y:p.y-r*.12},{x:p.x,y:p.y+r*.42}],"#A6BC96");
  }
}
function chair(c: Ctx, x: number, y: number, w: number, h: number, color = "#678093") {
  box(c,x+w*.42,y+h*.42,.13,.13,.08,.58,COLORS.metal);
  box(c,x+.05,y+h*.45,w-.1,.12,.02,.09,COLORS.metal);
  box(c,x+w*.45,y+.05,.12,h-.1,.02,.09,COLORS.metal);
  box(c,x,y,w,h,.63,.18,color,true);
  box(c,x,y,w,.15,.8,.78,shade(color,1.08),true);
}
function monitor(c: Ctx, x: number, y: number, width: number, z: number) {
  box(c,x+width*.35,y+.12,width*.3,.35,z,.055,COLORS.metal);
  box(c,x+width*.47,y+.14,.09,.1,z,.4,COLORS.metal);
  box(c,x,y,width,.13,z+.28,.98,COLORS.screen,true);
  polygon(c,[project(x+.08,y+.145,z+.36),project(x+width-.08,y+.145,z+.36),project(x+width-.08,y+.145,z+1.18),project(x+.08,y+.145,z+1.18)],"#B9D6DD");
  for(let i=0;i<3;i++) line(c,[project(x+.19,y+.15,z+.56+i*.18),project(x+width-.22,y+.15,z+.56+i*.18)],i===2?"#688FAD":"#E9F4F2",1.4);
}
function drawFurniture(c: Ctx, f: Furniture) {
  const {x,y,w,h,kind}=f;
  if (kind === "plant") { plant(c,x,y,w); return; }
  contactShadow(c,x,y,w,h,kind==="server"||kind==="shelf"?2:1);
  if (kind === "desk" || kind === "table") {
    for (const [dx,dy] of [[.14,.14],[w-.29,.14],[.14,h-.29],[w-.29,h-.29]]) box(c,x+dx,y+dy,.13,.13,0,1.3,"#8C9DA3");
    box(c,x,y,w,h,1.3,.16,kind==="desk"?COLORS.woodLight:"#CEAB84",true);
    if (kind === "desk") {
      monitor(c,x+.45,y+.28,Math.min(1.35,w-.7),1.46);
      box(c,x+.6,y+h-.5,1.05,.3,1.47,.035,"#DDE5E6",true);
      box(c,x+w-.65,y+.8,.25,.22,1.46,.28,"#F9FAF5");
      plane(c,x+w-.9,y+.14,.55,.65,1.47,"#FBFAF1");
    } else {
      plane(c,x+w*.36,y+.25,.7,.65,1.48,"#F9F7EF");
      box(c,x+w*.67,y+.55,.2,.2,1.46,.23,"#71949C");
    }
  } else if (kind === "counter") {
    box(c,x+.14,y+.1,w-.28,h-.2,0,1.8,"#A88560",true);
    box(c,x,y,w,h,1.8,.2,"#E2C7A8",true);
    for(let i=0;i<w;i+=.5) line(c,[project(x+i,y+h-.08,.15),project(x+i,y+h-.08,1.65)],"#977551",.8);
    monitor(c,x+1,y+.4,1.4,2);
    box(c,x+w-1.7,y+.35,1,.7,2,.07,"#F9F8F1",true);
    box(c,x+w-1.55,y+.5,.7,.4,2.08,.06,"#83A0AF");
  } else if (kind === "shelf") {
    box(c,x,y,w,h,0,2.9,"#A68967",true);
    for(let row=0;row<3;row++) {
      const z=.18+row*.87;
      polygon(c,[project(x+.1,y+h+.01,z),project(x+w-.1,y+h+.01,z),project(x+w-.1,y+h+.01,z+.7),project(x+.1,y+h+.01,z+.7)],"#806B54");
      const colors=["#97AABC","#BBC2A0","#D3B289","#DFD6C4","#7D98A3"];
      for(let n=0;n<7;n++) box(c,x+.16+n*(w-.3)/7,y+h-.19,.18,.21,z,.48+(n%3)*.07,colors[(n+row)%colors.length]);
      box(c,x,y+h-.12,w,.18,z-.07,.1,"#C8AA85");
    }
  } else if(kind === "cabinet") {
    box(c,x,y,w,h,0,1.5,"#CFD5D0",true);
    for(let i=0;i<Math.floor(w);i++) {
      line(c,[project(x+i,y+h,.1),project(x+i,y+h,1.4)],"#A7B5B4",.7);
      box(c,x+i+.4,y+h,.1,.07,.85,.11,"#738D99");
    }
    plane(c,x+.22,y+.1,.65,.5,1.51,"#A0B7BE");
  } else if(kind === "sofa") {
    const color=f.color??"#8DA4A6";
    box(c,x,y,w,h,.15,.8,shade(color,.82),true);
    box(c,x,y,w,.36,.95,.65,color,true);
    const count=Math.max(1,Math.floor(w/1.4));
    for(let i=0;i<count;i++) box(c,x+.12+i*(w-.24)/count,y+.4,(w-.24)/count-.07,h-.5,.95,.19,shade(color,1.13),true);
    box(c,x,y,.28,h,.92,.38,color); box(c,x+w-.28,y,.28,h,.92,.38,color);
  } else if(kind === "server") {
    box(c,x,y,w,h,0,3.2,"#526A77",true);
    for(let i=0;i<6;i++) {
      box(c,x+.08,y+h-.08,w-.16,.1,.25+i*.45,.32,"#263F4B");
      for(let j=0;j<3;j++) box(c,x+.19+j*.24,y+h+.025,.08,.015,.34+i*.45,.055,"#8CADBA");
    }
  } else if(kind === "board") {
    for(const dx of [.15,w-.28]) box(c,x+dx,y+.1,.12,.12,0,2.5,"#92A6AC");
    box(c,x,y,w,h,1.1,1.5,"#D0DCDA",true);
    polygon(c,[project(x+.1,y+h+.01,1.19),project(x+w-.1,y+h+.01,1.19),project(x+w-.1,y+h+.01,2.49),project(x+.1,y+h+.01,2.49)],"#F5F7EF");
    if(f.room==="ontology") {
      const nodes=[[.18,.35],[.47,.8],[.77,.45],[.6,.18]];
      for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[1,3]]) line(c,[project(x+nodes[a][0]*w,y+h+.03,1.25+nodes[a][1]),project(x+nodes[b][0]*w,y+h+.03,1.25+nodes[b][1])],"#81A4B6",1.5);
      for(const [dx,dz] of nodes) {const p=project(x+dx*w,y+h+.05,1.25+dz);c.fillStyle="#668F9F";c.beginPath();c.arc(p.x,p.y,3.6,0,Math.PI*2);c.fill();}
    } else {
      for(let i=0;i<3;i++) {
        const z=1.44+i*.3;
        polygon(c,[project(x+.35,y+h+.025,z),project(x+.58,y+h+.025,z),project(x+.58,y+h+.025,z+.18),project(x+.35,y+h+.025,z+.18)],i===2?"#AFC1B4":"#BBCFD8");
        line(c,[project(x+.8,y+h+.03,z+.08),project(x+w-.4-(i%2)*.5,y+h+.03,z+.08)],"#A7BABD",1.6);
      }
    }
  } else if(kind === "screen") {
    const columns=Math.max(1,Math.floor(w/2.5));
    for(let i=0;i<columns;i++) monitor(c,x+i*w/columns,y,w/columns-.15,.85);
  }
  else chair(c,x,y,w,h);
}

function wallItems(b: Building): DrawItem[] {
  if(b.doorSide === "open") return [];
  const out: DrawItem[]=[];
  const material=MATERIAL[b.material];
  for(const side of ["north","west","east","south"] as const) {
    const horizontal=side==="north"||side==="south";
    const start=horizontal?b.x0:b.y0,end=horizontal?b.x1:b.y1;
    const door=horizontal?b.doorX:b.doorY;
    for(let n=start;n<end;n+=1) {
      if(side===b.doorSide && n>=door-1.5 && n<door+1.5) continue;
      const x=horizontal?n:side==="west"?b.x0:b.x1-.22;
      const y=horizontal?(side==="north"?b.y0:b.y1-.22):n;
      const w=horizontal?Math.min(1,end-n):.22,h=horizontal?.22:Math.min(1,end-n);
      const high=side==="north"||side==="west";
      const height=high?b.wallH/16:.48;
      out.push({depth:x+y+(w+h)/2,draw:c=>{
        box(c,x,y,w,h,0,height,material.wall);
        box(c,x,y,w,h,height,.08,high?"#FEFEF8":material.accent);
        if(high && n%4<2 && n>start+1 && n<end-2) {
          // Frosted glass panels with a solid sill, avoiding a dark enclosing wall.
          const pts=horizontal?[project(x,y+.23,.8),project(x+w,y+.23,.8),project(x+w,y+.23,height-.3),project(x,y+.23,height-.3)]
            :[project(x+.23,y,.8),project(x+.23,y+h,.8),project(x+.23,y+h,height-.3),project(x+.23,y,height-.3)];
          polygon(c,pts,"#C9DCE0","#ADC5CC",.55);
        }
      }});
    }
  }
  out.push({depth:b.doorX+b.doorY-.15,draw:c=>{
    const horizontal=b.doorSide==="north"||b.doorSide==="south";
    plane(c,b.doorX-(horizontal?1.4:.4),b.doorY-(horizontal?.4:1.4),horizontal?2.8:.8,horizontal?.8:2.8,.015,"#ADBCC1");
    for(const sign of [-1,1]) {
      const x=b.doorX+(horizontal?sign*1.5:0),y=b.doorY+(horizontal?0:sign*1.5);
      box(c,x-.09,y-.09,.18,.18,0,.92,"#8CA0A7");
    }
  }});
  return out;
}

function drawFloor(c:Ctx) {
  polygon(c,[project(-.5,0,-.8),project(WORLD.w+.5,0,-.8),project(WORLD.w+1,WORLD.h+1,-.8),project(0,WORLD.h+1,-.8)],"rgba(43,64,78,.12)");
  box(c,0,0,WORLD.w,WORLD.h,-.7,.7,"#DCE4E5",true);
  plane(c,.3,.3,WORLD.w-.6,WORLD.h-.6,.015,"#EDF0EC");
  for(let x=0;x<WORLD.w;x+=4) line(c,[project(x,0,.02),project(x,WORLD.h,.02)],"#E0E7E3",.6);
  for(let y=0;y<WORLD.h;y+=4) line(c,[project(0,y,.02),project(WORLD.w,y,.02)],"#E0E7E3",.6);
  for(const b of BUILDINGS) {
    const m=MATERIAL[b.material];
    const floor=b.id==="reception"?"#DCE8EE":b.doorSide==="open"?"#E1E7E3":m.floor;
    polygon(c,roomPolygon(b,.025),floor,b.id==="reception"?"#C2D6DF":"#CFD9D7",1.3);
    if(b.id==="reception") {
      // A generous central carpet and inset perimeter make the lobby read as the heart of the office.
      plane(c,b.x0+.9,b.y0+.9,b.x1-b.x0-1.8,b.y1-b.y0-1.8,.04,"#E4EDF1","#C4D6DD");
      floorEllipse(c,HUB.x,HUB.y,5.5,4.7,"#D6E4ED",.05);
      floorEllipse(c,HUB.x,HUB.y,4.9,4.1,"#DFEAF0",.055);
    } else if(b.doorSide!=="open") {
      for(let y=b.y0+1;y<b.y1;y+=b.material==="wood"?.9:2) line(c,[project(b.x0+.2,y,.04),project(b.x1-.2,y,.04)],m.seam,.55);
      if(b.material!=="wood") for(let x=b.x0+2;x<b.x1;x+=2) line(c,[project(x,b.y0+.2,.04),project(x,b.y1-.2,.04)],m.seam,.55);
    }
  }
}
const STATIC_ITEMS: DrawItem[] = [
  ...BUILDINGS.flatMap(wallItems),
  ...FURNITURE.map(f=>({depth:f.x+f.y+(f.w+f.h)/2,draw:(c:Ctx)=>drawFurniture(c,f)})),
  ...DECOR.map(d=>({depth:d.x+d.y,draw:(c:Ctx)=>plant(c,d.x-.4,d.y-.4,1)})),
];
// Exterior rear walls and mullions retain a legible cutaway, with low front edges.
for(let x=0;x<WORLD.w;x++) STATIC_ITEMS.push({depth:x+.5,draw:c=>{
  box(c,x,0,1,.22,0,3.5,"#DAE4E5"); box(c,x,0,1,.22,3.5,.1,"#FCFDF7");
  if(x%5!==0) polygon(c,[project(x,.24,.85),project(x+1,.24,.85),project(x+1,.24,3.1),project(x,.24,3.1)],"#C5DADF");
}});
for(let y=0;y<WORLD.h;y++) STATIC_ITEMS.push({depth:y+.5,draw:c=>box(c,0,y,.22,1,0,3.5,"#DFE8E7")});
for(let x=0;x<WORLD.w;x++) STATIC_ITEMS.push({depth:x+WORLD.h,draw:c=>box(c,x,WORLD.h-.2,1,.2,0,.36,"#92A6AF")});
for(let y=0;y<WORLD.h;y++) STATIC_ITEMS.push({depth:WORLD.w+y,draw:c=>box(c,WORLD.w-.2,y,.2,1,0,.36,"#92A6AF")});
STATIC_ITEMS.sort((a,b)=>a.depth-b.depth);

function stateColor(state: AgentState|undefined): string {
  return state==="working"?"#006EDA":state==="validating"||state==="waiting"?"#B7791F":state==="blocked"?"#BF4753":state==="completed"?"#277D70":"#A8B7BE";
}
function customerColor(badge:string):string {
  if(/^#[0-9a-f]{6}$/i.test(badge))return badge;
  const palette=["#AF8969","#70958E","#8B87A2","#608CA1"];
  return palette[Array.from(badge).reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%palette.length];
}
function person(c:Ctx,p:Point,color:string,state:AgentState|undefined,selected:boolean,moving:boolean,time:number,facing:Point={x:0,y:1},activity:StaffActivityKind="idle") {
  const workGesture=activity==="desk-work"?Math.sin(time/620)*.055:0;
  const conversationalGesture=activity==="meeting"?Math.sin(time/480)*.075:0;
  const stride=moving?Math.sin(time/105)*.13:0;
  const lean=moving ? 0.07 : 0;
  const x=p.x+facing.x*lean,y=p.y+facing.y*lean;
  floorEllipse(c,x+.2,y+.2,.58,.48,"rgba(44,61,64,.17)");
  if(selected||state==="working"||state==="validating") {
    const ring=Array.from({length:33},(_,i)=>project(x+Math.cos(i*Math.PI/16)*.82,y+Math.sin(i*Math.PI/16)*.82,.05));
    line(c,ring,selected?"#006EDA":stateColor(state),2.2);
  }
  const step=moving?Math.sin(time/105)*.12:0;
  box(c,x-.28,y-.2+step,.24,.3,0,.75,"#364A58");
  box(c,x+.1,y-.12-step,.24,.3,0,.75,"#293C4B");
  box(c,x-.3,y-.1+step,.26,.4,0,.13,"#243642");
  box(c,x+.1,y-.02-step,.26,.4,0,.13,"#243642");
  box(c,x-.38,y-.28,.78,.58,.7,.88,color,true);
  box(c,x-.51,y-.2+stride+conversationalGesture,.19,.3,.77,.67,shade(color,.9));
  box(c,x+.41,y-.15-stride+workGesture,.19,.3,.77,.62,shade(color,.9));
  box(c,x-.5,y-.2+stride+conversationalGesture,.17,.3,.66,.18,"#D3A884");
  box(c,x+.41,y-.15-stride+workGesture,.17,.3,.66,.18,"#D3A884");
  const headX=x+facing.x*(moving ? 0.08 : 0),headY=y+facing.y*(moving ? 0.08 : 0);
  box(c,headX-.26,headY-.2,.55,.5,1.59+(activity==="break"?Math.sin(time/850)*.025:0),.58,"#D9B18F",true);
  box(c,headX-.28,headY-.22,.59,.53,2.03,.2,"#344049");
  box(c,headX-.3,headY-.23,.13,.48,1.78,.3,"#344049");
  if(moving) {
    const direction=project(headX+facing.x*.34,headY+facing.y*.34,1.88);
    c.fillStyle="#5D4337";c.beginPath();c.arc(direction.x,direction.y,1.25,0,Math.PI*2);c.fill();
  }
  // Badge and shirt collar are geometric, not decorative task counters.
  box(c,x+.08,y+.315,.18,.025,1.12,.22,"#F3F6F3");
  if(state && state!=="idle") {
    const q=project(x,y,2.72);
    c.fillStyle=stateColor(state); c.beginPath(); c.arc(q.x,q.y,5.3,0,Math.PI*2); c.fill();
    c.strokeStyle="#FFFFFF"; c.lineWidth=1.3;
    if(state==="completed") {c.beginPath();c.moveTo(q.x-2.5,q.y);c.lineTo(q.x-.3,q.y+2);c.lineTo(q.x+2.8,q.y-2.3);c.stroke();}
    else if(state==="blocked"||state==="waiting") {c.beginPath();c.moveTo(q.x,q.y-2.9);c.lineTo(q.x,q.y+.7);c.stroke();c.fillStyle="#fff";c.fillRect(q.x-.7,q.y+2,.9,.9);}
    else {c.beginPath();c.arc(q.x,q.y,2.4,0,Math.PI*1.45);c.stroke();}
  }
}
function mover(p:Point):MotionMover { return {position:{...p},destination:{...p},path:[]}; }
function retarget(m:MotionMover,d:Point,immediate:boolean) {
  if(m.destination.x===d.x&&m.destination.y===d.y) {if(immediate) {m.position={...d};m.path=[];} return;}
  m.destination={...d};
  if(immediate) {m.position={...d};m.path=[];return;}
  m.path=walkPath(m.position,d);
}
function customerPoint(state:CustomerState):Point {
  const key=customerDest(state);
  return key==="plaza"?QUEUE_SPOTS[0]:CUSTOMER_SPOTS[key as keyof typeof CUSTOMER_SPOTS]??HUB;
}
function sourceFor(target:string):Point {
  if(target==="routing"||target==="extract"||target==="input") return STATION_SPOTS.input;
  if(target==="judge") return STATION_SPOTS.extract;
  if(target==="guard"||target==="ontology") return STATION_SPOTS.judge;
  if(target==="narrate") return STATION_SPOTS.guard;
  if(target==="translate") return STATION_SPOTS.narrate;
  if(target==="counselor") return STATION_SPOTS.narrate;
  if(target==="archive"||target==="records"||target==="gate") return COUNSELOR_SPOT;
  return HUB;
}
function documentPacket(c:Ctx,p:Point,color:string) {
  contactShadow(c,p.x-.27,p.y-.2,.65,.8,.7);
  box(c,p.x-.28,p.y-.28,.65,.85,.8,.07,"#FCFDF8",true);
  plane(c,p.x-.18,p.y-.14,.42,.13,.88,color);
  for(let i=0;i<3;i++) plane(c,p.x-.18,p.y+.08+i*.15,.39,.045,.88,"#9BB0BA");
}

export function OfficeCanvas(props:OfficeCanvasProps) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const propsRef=useRef(props);
  const wakeRef=useRef<(()=>void)|null>(null);
  useEffect(()=>{propsRef.current=props;wakeRef.current?.();},[props]);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const c=canvas.getContext("2d"); if(!c) return;
    let raf=0,last=0,drawCount=0,totalDrawMs=0,alive=true;
    let motion:SceneMotion={key:"",customer:mover(HUB),docs:{}};
    let staffMotion:OfficeMotionState=createOfficeMotion(Object.keys(propsRef.current.agents),performance.now());
    const frameMs=1000/30;
    function draw(now:number) {
      raf=0;
      if(!alive||document.hidden) {last=0;return;}
      if(last&&now-last<frameMs) {raf=requestAnimationFrame(draw);return;}
      const started=performance.now(),p=propsRef.current;
      const dt=Math.min(.045,last?(now-last)/1000:0);last=now;
      const runKey=p.runKey??"default";
      if(motion.key!==runKey) motion={key:runKey,customer:mover(p.customer?customerPoint(p.customer.state):HUB),docs:{}};
      if(p.customer) retarget(motion.customer,customerPoint(p.customer.state),p.reducedMotion);
      const targets=[...new Set(p.transfers?.map(t=>t.to)??p.docTargets??(p.docTarget?[p.docTarget]:[]))];
      const transferSource=(target:string):Point=>{
        const transfer=p.transfers?.find(t=>t.to===target);
        return transfer?standTile(transfer.from):sourceFor(target);
      };
      for(const target of Object.keys(motion.docs)) if(!targets.includes(target)) delete motion.docs[target];
      for(const target of targets) {
        if(!motion.docs[target]) {
          motion.docs[target]=mover(transferSource(target));
          retarget(motion.docs[target],standTile(target),p.reducedMotion);
        } else if(p.reducedMotion) retarget(motion.docs[target],standTile(target),true);
      }
      if(Object.keys(staffMotion.staff).length!==Object.keys(p.agents).length||Object.keys(p.agents).some(id=>!staffMotion.staff[id])) {
        staffMotion=createOfficeMotion(Object.keys(p.agents),now);
      }
      const staffTick=tickOfficeMotion(staffMotion,{nowMs:now,ambientMotion:!!p.ambientMotion,reducedMotion:p.reducedMotion,hidden:false,agents:p.agents});
      staffMotion=staffTick.motion;
      let moving=p.customer?advanceMoverAndCombine(motion.customer,dt,6,staffTick.moving):staffTick.moving;
      for(const m of Object.values(motion.docs)) moving=advanceMoverAndCombine(m,dt,20,moving);
      const ratio=Math.min(window.devicePixelRatio||1,2),w=p.cssSize.w,h=p.cssSize.h;
      const pw=Math.round(w*ratio),ph=Math.round(h*ratio);
      if(canvas!.width!==pw||canvas!.height!==ph) {canvas!.width=pw;canvas!.height=ph;}
      c!.setTransform(ratio,0,0,ratio,0,0);c!.clearRect(0,0,w,h);
      c!.fillStyle="#EDF2F5";c!.fillRect(0,0,w,h);
      c!.save();c!.translate(p.camera.tx,p.camera.ty);c!.scale(p.camera.scale,p.camera.scale);
      c!.lineJoin="round";c!.lineCap="round";
      drawFloor(c!);
      // Handoffs share the actual walk graph. Retired work disappears immediately, never extends execution.
      for(const target of targets) {
        const source=transferSource(target),destination=standTile(target);
        const route=[source,...walkPath(source,destination)].map(q=>project(q.x,q.y,.07));
        c!.save();c!.setLineDash([4,7]);line(c!,route,"rgba(0,110,218,.32)",1.65);c!.restore();
        floorEllipse(c!,destination.x,destination.y,1.1,1.1,"rgba(0,110,218,.12)",.06);
      }
      if(p.selectedBuilding) {
        const b=BUILDINGS.find(b=>b.id===p.selectedBuilding);
        if(b) {const pts=roomPolygon(b,.08);line(c!,[...pts,pts[0]],"#006EDA",3);}
      }
      for(const b of BUILDINGS) if(b.stations.some(id=>p.agents[id]==="working")) {
        const pts=roomPolygon(b,.08);line(c!,[...pts,pts[0]],"#428EC2",2.2);
      }
      const actorPositions:Record<string,Point>={};
      const actorFloorPositions:Record<string,Point>={};
      const dynamic:DrawItem[]=[];
      for(const [index,[id,state]] of Object.entries(p.agents).entries()) {
        const member=staffMotion.staff[id];
        const q=member?.position??(id==="counselor"?COUNSELOR_SPOT:id==="records"?ARCHIVE_SPOT:STATION_SPOTS[id]);
        if(!q)continue;
        actorPositions[id]=project(q.x,q.y);
        actorFloorPositions[id]=q;
        dynamic.push({depth:q.x+q.y,draw:ctx=>person(ctx,q,id==="counselor"?"#BA9065":id==="records"?"#708391":"#527C95",state,p.selectedAgent===id,!!member?.path.length,now+index*137,member?.facing,member?.activity.kind)});
      }
      const customerPos=p.customer?motion.customer.position:null;
      if(customerPos) dynamic.push({depth:customerPos.x+customerPos.y,draw:ctx=>person(ctx,customerPos,customerColor(p.customer!.badge),p.customer!.state==="blocked"?"waiting":p.customer!.state==="completed"?"completed":undefined,p.selectedAgent==="customer",motion.customer.path.length>0,now)});
      p.queue.slice(0,QUEUE_SPOTS.length).forEach((q,i)=>{
        const spot=QUEUE_SPOTS[i];dynamic.push({depth:spot.x+spot.y,draw:ctx=>person(ctx,spot,customerColor(q.badge),undefined,p.selectedAgent===q.id,false,now)});
      });
      for(const [id,m] of Object.entries(motion.docs)) dynamic.push({depth:m.position.x+m.position.y+.2,draw:ctx=>documentPacket(ctx,m.position,id==="counselor"?"#B7791F":"#006EDA")});
      dynamic.sort((a,b)=>a.depth-b.depth);
      let si=0,di=0;
      while(si<STATIC_ITEMS.length||di<dynamic.length) {
        if(di<dynamic.length&&(si===STATIC_ITEMS.length||dynamic[di].depth<STATIC_ITEMS[si].depth))dynamic[di++].draw(c!);
        else STATIC_ITEMS[si++].draw(c!);
      }
      c!.restore();
      const docs=Object.fromEntries(Object.entries(motion.docs).map(([id,m])=>[id,project(m.position.x,m.position.y)]));
      canvas!.dataset.positions=JSON.stringify({customer:customerPos?project(customerPos.x,customerPos.y):null,doc:Object.values(docs)[0]??null,docs,agents:actorPositions});
      // Preserve original floor coordinates for geometry verification. Projecting and
      // inverting a doorway boundary can introduce tiny IEEE-754 rounding errors.
      canvas!.dataset.floorPositions=JSON.stringify({customer:customerPos,docs:Object.fromEntries(Object.entries(motion.docs).map(([id,m])=>[id,m.position])),agents:actorFloorPositions});
      canvas!.dataset.activities=JSON.stringify(officeActivityTelemetry(staffMotion));
      canvas!.dataset.coordinateSpace="projected-world";
      canvas!.dataset.docTargets=targets.join(",");
      canvas!.dataset.transfers=JSON.stringify(targets.map(to=>{
        const transfer=p.transfers?.find(t=>t.to===to);
        return {id:transfer?.id??to,from:transfer?.from??null,to,label:transfer?.label??"업무 전달",arrived:!motion.docs[to]?.path.length};
      }));
      canvas!.dataset.gateOpen=String(p.gateOpen);
      canvas!.dataset.drawCount=String(++drawCount);
      totalDrawMs+=performance.now()-started;
      canvas!.dataset.averageDrawMs=(totalDrawMs/drawCount).toFixed(2);
      canvas!.dataset.moving=String(moving);
      canvas!.dataset.frameRateCap="30";
      if((moving||p.ambientMotion)&&!p.reducedMotion) raf=requestAnimationFrame(draw); else last=0;
    }
    function wake() {if(!alive||document.hidden)return;if(!raf)raf=requestAnimationFrame(draw);}
    function visibility() {
      const p=propsRef.current;
      staffMotion=tickOfficeMotion(staffMotion,{nowMs:performance.now(),ambientMotion:!!p.ambientMotion,reducedMotion:p.reducedMotion,hidden:true,agents:p.agents}).motion;
      if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else wake();
    }
    wakeRef.current=wake; document.addEventListener("visibilitychange",visibility);wake();
    return()=>{alive=false;cancelAnimationFrame(raf);wakeRef.current=null;document.removeEventListener("visibilitychange",visibility);};
  },[]);
  return <canvas ref={canvasRef} data-office-canvas="isometric" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} />;
}

export default OfficeCanvas;
