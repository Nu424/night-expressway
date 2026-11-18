import { V3, rr } from './util';

export const state:any={weatherMode:'auto',rain:0,rainTarget:0,wet:0,weatherT:rr(70,120),view:'interior',tunnel:0,bump:0,bumpV:0,wiperPhase:0,wiperOn:false,wiperAng:[0,0],prevWiper:[0,0],wiperPause:0,exposure:1,exposureBase:1.05,adapt:1,dawnMode:'night',dawnStart:0,dawn:0,sleepEnd:0,sleepFade:0};
export const camState={look:new V3(),init:false,roll:0};
export const dbg:any={on:false,yaw:0.5,pitch:1.05,dist:950,t:0,fps:60,drag:null};

/** 設定から変える走行・天気・ルートの調整値 */
export const tune={speed:1,traffic:1,laneChange:true,bob:1,haze:1,rainAmount:0.85,drops:1,weatherSpeed:1,route:'auto',lamp:'auto',wiper:'auto'};
