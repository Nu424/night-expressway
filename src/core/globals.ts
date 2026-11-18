import * as THREE from 'three';

export const FOG_COLOR=new THREE.Color().setRGB(0.050,0.040,0.048);
export const FOG_DENS=0.00072;
export const U={
  time:{value:0}, wet:{value:0}, rain:{value:0},
  reflTex:{value:null}, texMat:{value:new THREE.Matrix4()},
  reflRoad:{value:0}, reflWater:{value:0},
  hazeCol:{value:FOG_COLOR.clone()}, haze:{value:FOG_DENS},
  blink:{value:0}, pr:{value:1},
  cityLit:{value:0.6}, cityGain:{value:1},
  proj:{value:700}, haloSpread:{value:1},
};
export const STEP=2, CH=100, SPC=CH/STEP;
export const AHEAD=1600, BEHIND=200;
export const LANES=[-6.25,-2.75];       // our carriageway: 0 = driving lane (left), 1 = passing lane
export const LANES_OPP=[2.75,6.25];     // oncoming carriageway
export const LAMP_COLORS={sodium:[1.0,0.46,0.15],warm:[1.0,0.74,0.48],white:[0.82,0.88,1.0]};
export const TUNNEL_NAMES=[['山之手トンネル','YAMANOTE TUNNEL'],['臨港トンネル','RINKO TUNNEL'],['羽根田トンネル','HANETA TUNNEL'],['千代原トンネル','CHIYOHARA TUNNEL'],['大楠トンネル','OKUSU TUNNEL']];
