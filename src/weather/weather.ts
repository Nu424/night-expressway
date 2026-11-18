import * as THREE from 'three';
import { FOG_DENS, U } from '../core/globals';
import { dbg, state, tune } from '../core/state';
import { clamp, rr } from '../core/util';
import { scene } from '../render/renderer';

export function updateWeather(dt){
  if(state.weatherMode==='auto'){
    state.weatherT-=dt;
    if(state.weatherT<=0){ if(state.rainTarget>0.1){ state.rainTarget=0; state.weatherT=rr(240,420);} else { state.rainTarget=rr(0.45,1.0); state.weatherT=rr(180,330);} }
  } else state.rainTarget= state.weatherMode==='rain'?tune.rainAmount:0;
  state.rain+=clamp(state.rainTarget-state.rain,-dt/25*tune.weatherSpeed,dt/25*tune.weatherSpeed);
  const wetT=Math.max(state.rain>0.05?Math.min(1,state.rain*1.4):0, 0);
  state.wet+= wetT>state.wet? (wetT-state.wet)*dt/12 : (wetT-state.wet)*dt/80;
  U.rain.value=state.rain; U.wet.value=state.wet;
  const fd=dbg.on?FOG_DENS*0.18:FOG_DENS*(1+state.rain*0.7)*tune.haze;
  U.haloSpread.value=(1+state.rain*0.9)*Math.sqrt(tune.haze);
  (scene.fog as THREE.FogExp2).density=fd; U.haze.value=fd;
}
