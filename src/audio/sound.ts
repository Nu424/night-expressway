import { rr } from '../core/util';
import { update } from '../main';

export class Sound{
  [k:string]:any;
  /** 各音の音量倍率と種別（設定から変更する） */
  mix:any={ui:1,road:1,wind:1,engine:1,rain:1,joints:1,blinker:1,wiper:1,pass:1,cabin:0.25,engineType:'ice'};
  start(ctx?:any){
    const C=this.ctx=ctx||new ((window as any).AudioContext||(window as any).webkitAudioContext)();
    this.out=C.createGain(); this.out.gain.value=0;
    const comp=C.createDynamicsCompressor(); comp.threshold.value=-16; comp.ratio.value=3; comp.attack.value=0.01; comp.release.value=0.3;
    this.out.connect(comp); comp.connect(C.destination);
    // 車外の音はすべて「車内のこもり」フィルタを通す。音楽は車内で鳴るので別経路。
    this.cabinF=C.createBiquadFilter(); this.cabinF.type='lowpass'; this.cabinF.frequency.value=9000; this.cabinF.Q.value=0.5; this.cabinF.connect(this.out);
    this.bus=C.createGain(); this.bus.connect(this.cabinF);
    this.musicIn=C.createGain(); this.musicIn.connect(this.out);
    this.verb=C.createConvolver(); this.verb.buffer=this.ir(2.6,2.6);
    this.verbGain=C.createGain(); this.verbGain.gain.value=0; this.bus.connect(this.verb); this.verb.connect(this.verbGain); this.verbGain.connect(this.cabinF);
    const brown=this.noise('brown',8), white=this.noise('white',5), pink=this.noise('pink',7);
    this.bufs={brown,white,pink};
    const lp=(f,q=0.7)=>{const n=C.createBiquadFilter();n.type='lowpass';n.frequency.value=f;n.Q.value=q;return n;};
    const bp=(f,q=0.7)=>{const n=C.createBiquadFilter();n.type='bandpass';n.frequency.value=f;n.Q.value=q;return n;};
    const hp=(f,q=0.7)=>{const n=C.createBiquadFilter();n.type='highpass';n.frequency.value=f;n.Q.value=q;return n;};
    const loop=(buf,...nodes)=>{const s=C.createBufferSource();s.buffer=buf;s.loop=true;s.loopStart=0;s.start(0,Math.random()*buf.duration);const g=C.createGain();g.gain.value=0;let cur=s;for(const n of nodes){cur.connect(n);cur=n;}cur.connect(g);g.connect(this.bus);return {g,nodes};};
    this.road=loop(brown,lp(500));
    this.rumble=loop(brown,bp(85,1.2));
    this.tire=loop(pink,bp(900,0.8));
    this.wind=loop(white,bp(1300,0.5),lp(3500));
    this.hiss=loop(white,hp(2600));
    this.rainN=loop(white,bp(4200,0.35));
    this.roof=loop(pink,bp(1800,0.6));
    this.tun=loop(pink,bp(260,0.8));
    const eo=C.createOscillator(); eo.type='sawtooth'; const eo2=C.createOscillator(); eo2.type='sine';
    const el=lp(150,1.5); const eg=C.createGain(); eg.gain.value=0; eo.connect(el); eo2.connect(el); el.connect(eg); eg.connect(this.bus); eo.start(); eo2.start();
    this.engine={o:eo,o2:eo2,g:eg};
    // モーターの高い唸り（ハイブリッド・EV 用）
    const wo=C.createOscillator(); wo.type='sine'; const wo2=C.createOscillator(); wo2.type='triangle'; const wl=lp(2600,0.7); const wg=C.createGain(); wg.gain.value=0; wo.connect(wl); wo2.connect(wl); wl.connect(wg); wg.connect(this.bus); wo.start(); wo2.start();
    this.whine={o:wo,o2:wo2,g:wg};
    const lfo=C.createOscillator(); lfo.frequency.value=0.11; const lg=C.createGain(); lg.gain.value=0.25; lfo.connect(lg); lfo.start(); this.windLfo=lg;
    this.vol=0.8; this.muted=false;
    this.out.gain.setTargetAtTime(this.vol,C.currentTime,1.5);
  }
  noise(kind,sec){
    const C=this.ctx, n=C.sampleRate*sec, b=C.createBuffer(2,n,C.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=b.getChannelData(ch); let last=0,b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for(let i=0;i<n;i++){ const w=Math.random()*2-1;
        if(kind==='white') d[i]=w*0.5;
        else if(kind==='brown'){ last=(last+0.02*w)/1.02; d[i]=last*3.5; }
        else { b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.969*b2+w*0.153852;b3=0.8665*b3+w*0.3104856;b4=0.55*b4+w*0.5329522;b5=-0.7616*b5-w*0.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;b6=w*0.115926; } }
      // crossfade ends for seamless loop
      const fade=Math.floor(C.sampleRate*0.05); for(let i=0;i<fade;i++){ const t=i/fade; d[n-fade+i]=d[n-fade+i]*(1-t)+d[i]*t; }
    }
    return b;
  }
  ir(sec,decay){ const C=this.ctx,n=C.sampleRate*sec,b=C.createBuffer(2,n,C.sampleRate); for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<n;i++){d[i]=(Math.random()*2-1)*Math.pow(1-i/n,decay)*(i<C.sampleRate*0.012?0:1);}} return b; }
  set(node,v,tc=0.3){ node.g.gain.setTargetAtTime(v,this.ctx.currentTime,tc); }
  update(st){
    if(!this.ctx) return;
    const C=this.ctx, t=C.currentTime, sp=st.v/22, tun=st.tunnel, m=this.mix;
    this.cabinF.frequency.setTargetAtTime(16000*Math.pow(0.1,m.cabin),t,0.3);
    this.set(this.road,(0.30+0.25*sp)*(1+tun*0.45)*m.road);
    this.road.nodes[0].frequency.setTargetAtTime(300+260*sp+tun*180,t,0.5);
    this.set(this.rumble,0.25*sp*(1+tun*0.6)*m.road);
    this.set(this.tire,0.035*sp*(1+tun)*m.road);
    this.set(this.wind,0.018*sp*sp*(1-tun*0.6)*m.wind,0.6);
    this.set(this.hiss,0.07*st.wet*sp*m.road,0.8);
    this.set(this.rainN,0.05*st.rain*(1-tun)*m.rain,1.2);
    this.set(this.roof,0.05*st.rain*(1-tun)*m.rain,1.2);
    this.set(this.tun,0.15*tun*sp*m.road,0.8);
    this.verbGain.gain.setTargetAtTime(0.4*tun,t,0.6);
    // エンジン: ガソリンは低いうなり、ハイブリッドは控えめなうなり＋モーター音、EV はモーター音のみ
    const ty=m.engineType, ice= ty==='ice'?1: ty==='hybrid'?0.4:0, mot= ty==='ice'?0: ty==='hybrid'?0.6:1;
    const rpm=1250+st.v*3.6*13+st.acc*120; const f=rpm/60*2;
    this.engine.o.frequency.setTargetAtTime(f,t,0.3); this.engine.o2.frequency.setTargetAtTime(f/2,t,0.3);
    this.engine.g.gain.setTargetAtTime((0.028+Math.max(0,st.acc)*0.02)*ice*m.engine,t,0.4);
    const wf=260+st.v*46; this.whine.o.frequency.setTargetAtTime(wf,t,0.25); this.whine.o2.frequency.setTargetAtTime(wf*2.01,t,0.25);
    this.whine.g.gain.setTargetAtTime((0.0035+Math.abs(st.acc)*0.004)*sp*mot*m.engine,t,0.4);
    // 屋根とガラスを叩く雨粒: 雨量に応じた数を、フレーム時間に依存しない確率で鳴らす
    if(st.rain>0.03 && m.rain>0){ let n=st.rain*26*(st.dt||0.016); while(n>0){ if(Math.random()<n) this.drip(m.rain); n-=1; } }
  }
  /** トンネル突入時の圧迫感: 低い空気の塊がぶつかる音 */
  whump(){
    if(!this.ctx) return; const C=this.ctx,t0=C.currentTime;
    const s=C.createBufferSource(); s.buffer=this.bufs.brown; const f=C.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(90,t0); f.frequency.linearRampToValueAtTime(260,t0+0.25); f.frequency.linearRampToValueAtTime(70,t0+1.2);
    const g=C.createGain(); g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(1.1*this.mix.road,t0+0.18); g.gain.exponentialRampToValueAtTime(0.0001,t0+1.4);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t0,Math.random()*5,1.6);
  }
  env(g,t0,a,peak,d){ g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(peak,t0+a); g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d); }
  thump(when,strength){
    const C=this.ctx,t0=C.currentTime+when;
    const s=C.createBufferSource(); s.buffer=this.bufs.brown; const f=C.createBiquadFilter(); f.type='lowpass'; f.frequency.value=520; const g=C.createGain();
    s.connect(f); f.connect(g); g.connect(this.bus); this.env(g,t0,0.003,1.5*strength,0.1); s.start(t0,Math.random()*5,0.2);
    const s2=C.createBufferSource(); s2.buffer=this.bufs.pink; const f2=C.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=rr(900,1300); f2.Q.value=2.5; const g2=C.createGain();
    s2.connect(f2); f2.connect(g2); g2.connect(this.bus); this.env(g2,t0,0.001,0.5*strength,0.035); s2.start(t0,Math.random()*5,0.1);
    const o=C.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(78,t0); o.frequency.exponentialRampToValueAtTime(38,t0+0.12);
    const og=C.createGain(); o.connect(og); og.connect(this.bus); this.env(og,t0,0.004,0.95*strength,0.16); o.start(t0); o.stop(t0+0.3);
  }
  joint(v){ if(!this.ctx||this.mix.joints<=0) return; const st=rr(0.55,0.8)*this.mix.joints; const dtA=2.7/Math.max(v,3); this.thump(0,st); this.thump(dtA,st*0.85); }
  whoosh(pan,strength,dur){
    if(!this.ctx) return; const C=this.ctx,t0=C.currentTime; strength*=this.mix.pass;
    const s=C.createBufferSource(); s.buffer=this.bufs.pink; const f=C.createBiquadFilter(); f.type='bandpass'; f.Q.value=0.6;
    f.frequency.setValueAtTime(350,t0); f.frequency.linearRampToValueAtTime(1300,t0+dur*0.45); f.frequency.linearRampToValueAtTime(400,t0+dur);
    const g=C.createGain(); const p=C.createStereoPanner(); p.pan.setValueAtTime(pan*0.4,t0); p.pan.linearRampToValueAtTime(pan,t0+dur*0.5); p.pan.linearRampToValueAtTime(pan*0.6,t0+dur);
    s.connect(f); f.connect(g); g.connect(p); p.connect(this.bus);
    g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(strength,t0+dur*0.45); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    s.start(t0,Math.random()*5,dur+0.1);
  }
  tick(hi){ if(!this.ctx) return; const C=this.ctx,t0=C.currentTime; const o=C.createOscillator(); o.type='square'; o.frequency.value=hi?2300:1700; const f=C.createBiquadFilter(); f.type='bandpass'; f.frequency.value=hi?2600:1900; f.Q.value=4;
    const g=C.createGain(); o.connect(f); f.connect(g); g.connect(this.out); this.env(g,t0,0.001,0.06*this.mix.blinker,0.025); o.start(t0); o.stop(t0+0.05); }
  wiper(){ if(!this.ctx) return; const C=this.ctx,t0=C.currentTime; const s=C.createBufferSource(); s.buffer=this.bufs.pink; const f=C.createBiquadFilter(); f.type='bandpass'; f.frequency.value=700; f.Q.value=1.5;
    const g=C.createGain(); s.connect(f); f.connect(g); g.connect(this.out); this.env(g,t0,0.08,0.035*this.mix.wiper,0.45); s.start(t0,Math.random()*5,0.7);
    const o=C.createOscillator(); o.frequency.value=95; const og=C.createGain(); o.connect(og); og.connect(this.out); this.env(og,t0+0.5,0.005,0.05*this.mix.wiper,0.08); o.start(t0+0.5); o.stop(t0+0.7); }
  /** 雨粒1つ: 屋根を叩く短い雑音の粒と、ガラスに当たる高い粒をまぜる */
  drip(k=1){
    const C=this.ctx,t0=C.currentTime+Math.random()*0.05; const p=C.createStereoPanner(); p.pan.value=rr(-0.9,0.9); p.connect(this.out);
    if(Math.random()<0.6){ const s=C.createBufferSource(); s.buffer=this.bufs.white; const f=C.createBiquadFilter(); f.type='bandpass'; f.frequency.value=rr(900,2600); f.Q.value=rr(1.5,4);
      const g=C.createGain(); s.connect(f); f.connect(g); g.connect(p); this.env(g,t0,0.001,rr(0.02,0.07)*k,rr(0.02,0.05)); s.start(t0,Math.random()*4,0.1); }
    else { const o=C.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(rr(1800,3400),t0); o.frequency.exponentialRampToValueAtTime(rr(700,1200),t0+0.02);
      const g=C.createGain(); o.connect(g); g.connect(p); this.env(g,t0,0.001,rr(0.004,0.014)*k,0.03); o.start(t0); o.stop(t0+0.06); }
  }
  /** 設定画面の操作音 */
  click(hi=false){ if(!this.ctx||this.mix.ui<=0) return; const C=this.ctx,t0=C.currentTime; const o=C.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(hi?1500:1050,t0); o.frequency.exponentialRampToValueAtTime(hi?900:620,t0+0.03);
    const g=C.createGain(); o.connect(g); g.connect(this.out); this.env(g,t0,0.001,0.035*(this.mix.ui??1),0.04); o.start(t0); o.stop(t0+0.07); }
  duck=1;
  setVolume(v){ this.vol=v; if(this.ctx&&!this.muted) this.out.gain.setTargetAtTime(v*this.duck,this.ctx.currentTime,0.2); }
  /** スリープタイマーなどで全体を絞る（0〜1） */
  setDuck(k){ this.duck=k; if(this.ctx&&!this.muted) this.out.gain.setTargetAtTime(this.vol*k,this.ctx.currentTime,0.5); }
  toggleMute(){ this.muted=!this.muted; if(this.ctx) this.out.gain.setTargetAtTime(this.muted?0:this.vol*this.duck,this.ctx.currentTime,0.2); }
}
export const sound=new Sound();
