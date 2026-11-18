import { V3, rr } from './util';

export const state:any={weatherMode:'auto',rain:0,rainTarget:0,wet:0,weatherT:rr(70,120),view:'interior',tunnel:0,bump:0,bumpV:0,wiperPhase:0,wiperOn:false,wiperAng:[0,0],prevWiper:[0,0],wiperPause:0};
export const camState={look:new V3(),init:false,roll:0};
export const dbg:any={on:false,yaw:0.5,pitch:1.05,dist:950,t:0,fps:60,drag:null};
