const PHW_CORE = (function(){
  const G = 9.80665, ATM = 1.01325, BAR = 1e5;
  const NPS = [
    {nps:'1',od:33.4,id:26.6},{nps:'1.5',od:48.3,id:40.9},{nps:'2',od:60.3,id:52.5},
    {nps:'3',od:88.9,id:77.9},{nps:'4',od:114.3,id:102.3},{nps:'6',od:168.3,id:154.1},
    {nps:'8',od:219.1,id:202.7},{nps:'10',od:273.1,id:254.5},{nps:'12',od:323.9,id:303.2},
    {nps:'14',od:355.6,id:333.4},{nps:'16',od:406.4,id:381.0},{nps:'18',od:457.2,id:428.7},
    {nps:'20',od:508.0,id:477.8},{nps:'24',od:609.6,id:574.6}
  ];
  function friction(Re, eps, D){
    if(!(Re>0)) return 0;
    const turb = (R)=>{ const t = eps/(3.7*D) + 5.74/Math.pow(R,0.9); return 0.25/Math.pow(Math.log10(t),2); };
    if(Re < 2300) return 64/Re;
    if(Re < 4000){ const w=(Re-2300)/1700; return (1-w)*(64/2300) + w*turb(4000); }
    return turb(Re);
  }
  // ---------- Gas: isothermal Crane TP-410M ----------
  function gasSolve(i){
    const A = Math.PI*i.D*i.D/4;
    const Gm = i.mdot/A;
    const Re = i.D*Gm/i.mu;
    const f = friction(Re, i.eps, i.D);
    const K = f*i.L/i.D + i.kMinor;
    const P1 = i.P1;
    const rhs = P2 => (A*A*i.rho1/(K + 2*Math.log(P1/P2))) * ((P1*P1 - P2*P2)/P1);
    let a = P1*1e-9, b = P1;
    for(let k=0;k<300;k++){
      const m1 = a+(b-a)/3, m2 = b-(b-a)/3;
      if(rhs(m1) < rhs(m2)) a = m1; else b = m2;
    }
    const P2c = 0.5*(a+b);
    const mmax = Math.sqrt(rhs(P2c));
    const out = {A, Re, f, K, P1, mmax, P2c, choked:false};
    const m2t = i.mdot*i.mdot;
    if(m2t > mmax*mmax){ out.choked = true; return out; }
    let lo = P2c, hi = P1*(1-1e-13);
    for(let k=0;k<300;k++){
      const mid = 0.5*(lo+hi);
      if(rhs(mid) - m2t > 0) lo = mid; else hi = mid;
    }
    const P2 = 0.5*(lo+hi);
    const rho2 = i.rho1*P2/P1;
    out.P2 = P2; out.rho2 = rho2;
    out.V1 = i.mdot/(A*i.rho1);
    out.V2 = i.mdot/(A*rho2);
    out.Mach2 = out.V2/Math.sqrt(P1/i.rho1);
    out.dP = (P1-P2)/BAR;
    out.dP100 = out.dP*100/i.L;
    out.residual = Math.abs(rhs(P2)-m2t)/m2t;
    return out;
  }
  function gasPass(r, c){
    if(r.choked) return {vel:false, dp:false, choke:false, all:false};
    const vel = r.V2 <= c.vmax, dp = r.dP100 <= c.dpmax;
    return {vel, dp, choke:true, all: vel && dp};
  }
  function gasMaxFlow(i, c){
    const ok = m => { const r = gasSolve(Object.assign({}, i, {mdot:m})); return !r.choked && gasPass(r,c).all; };
    let lo = 1e-9, hi = Math.max(i.mdot, 1e-3);
    let n=0; while(ok(hi) && n<60){ lo = hi; hi *= 2; n++; }
    for(let k=0;k<80;k++){ const mid=0.5*(lo+hi); if(ok(mid)) lo=mid; else hi=mid; }
    const rHi = gasSolve(Object.assign({}, i, {mdot:hi}));
    let limit = 'choked flow';
    if(!rHi.choked){ const p = gasPass(rHi,c); limit = !p.vel && !p.dp ? 'velocity and pressure drop' : (!p.vel ? 'velocity' : 'pressure drop'); }
    return {mdot:lo, limit};
  }
  function gasScan(i, c, flow){
    return NPS.map(s=>{
      const r = gasSolve(Object.assign({}, i, {D:s.id/1000, mdot:flow}));
      const p = gasPass(r,c);
      return {nps:s.nps, id:s.id, r, p};
    });
  }
  // ---------- Liquid + pump ----------
  function liqLoss(Q, p, f){
    const A = Math.PI*p.D*p.D/4, V = Q/A;
    const Re = f.rho*V*p.D/f.mu;
    const fr = friction(Re, p.eps, p.D);
    const dP = (fr*p.L/p.D + p.K)*f.rho*V*V/2;
    return {V, Re, f:fr, dP};
  }
  function fitQuad(pts){
    const n = pts.length; let S=[0,0,0,0,0], T=[0,0,0];
    pts.forEach(p=>{ for(let k=0;k<5;k++) S[k]+=Math.pow(p.Q,k); for(let k=0;k<3;k++) T[k]+=p.H*Math.pow(p.Q,k); });
    const M = [[S[0],S[1],S[2],T[0]],[S[1],S[2],S[3],T[1]],[S[2],S[3],S[4],T[2]]];
    for(let c=0;c<3;c++){
      let piv=c; for(let r=c+1;r<3;r++) if(Math.abs(M[r][c])>Math.abs(M[piv][c])) piv=r;
      [M[c],M[piv]]=[M[piv],M[c]];
      for(let r=0;r<3;r++) if(r!==c){ const m=M[r][c]/M[c][c]; for(let k=c;k<4;k++) M[r][k]-=m*M[c][k]; }
    }
    return [M[0][3]/M[0][0], M[1][3]/M[1][1], M[2][3]/M[2][2]];
  }
  function interp(pts, key, Q){
    if(Q<=pts[0].Q) return pts[0][key];
    for(let k=1;k<pts.length;k++) if(Q<=pts[k].Q){
      const a=pts[k-1], b=pts[k], t=(Q-a.Q)/(b.Q-a.Q); return a[key]+t*(b[key]-a[key]);
    }
    return pts[pts.length-1][key];
  }
  function pumpHead(coef, Q, n){ const q=Q/n; return n*n*(coef[0]+coef[1]*q+coef[2]*q*q); }
  function sysHead(s, Qh){
    const Q = Qh/3600;
    const ls = liqLoss(Q, s.suc, s.fluid), ld = liqLoss(Q, s.dis, s.fluid);
    const stat = (s.zd - s.zs) + (s.Pd - s.Ps)*BAR/(s.fluid.rho*G);
    return {H: stat + (ls.dP+ld.dP)/(s.fluid.rho*G), stat, hfs: ls.dP/(s.fluid.rho*G), hfd: ld.dP/(s.fluid.rho*G), ls, ld};
  }
  function opPoint(s, pts, coef, n){
    const qmax = pts[pts.length-1].Q*n*1.5, steps=600;
    const g = Q => pumpHead(coef,Q,n) - sysHead(s,Q).H;
    if(g(0) <= 0) return null;
    let prev = 0;
    for(let k=1;k<=steps;k++){
      const q = qmax*k/steps;
      if(g(q) <= 0){
        let lo=prev, hi=q;
        for(let j=0;j<80;j++){ const mid=0.5*(lo+hi); if(g(mid)>0) lo=mid; else hi=mid; }
        return 0.5*(lo+hi);
      }
      prev = q;
    }
    return null;
  }
  function pumpAnalyse(s, pts, n, reqQ, crit){
    const coef = fitQuad(pts);
    const Q = opPoint(s, pts, coef, n);
    const res = {coef, n, findings:[]};
    const bep = pts.reduce((a,b)=> b.eta>a.eta ? b : a);
    res.bepQ = bep.Q*n; res.bepEta = bep.eta;
    res.shutoff = pumpHead(coef,0,n);
    if(Q===null){ res.noFlow = true; res.findings.push({level:'fail', text:'No operating point: system static head exceeds pump shut-off head.'}); return res; }
    const sh = sysHead(s,Q);
    const qe = Q/n;
    const eta = interp(pts,'eta',qe);
    const npshr = n*n*interp(pts,'npshr',qe);
    const Qs = Q/3600;
    const hydKW = s.fluid.rho*G*Qs*sh.H/1000;
    const shaftKW = eta>0 ? hydKW/(eta/100) : NaN;
    const npshaAt = q => ((s.Ps+ATM) - s.fluid.pvap)*BAR/(s.fluid.rho*G) + s.zs - sysHead(s,q).hfs;
    const npsha = npshaAt(Q);
    Object.assign(res, {Q, H:sh.H, eta, npshr, npsha, npshaAt, hydKW, shaftKW, sh, bepRatio: Q/res.bepQ,
      npshRatio: npsha/npshr, Vd: sh.ld.V, Vs: sh.ls.V, fricShare: (sh.hfs+sh.hfd)/sh.H});
    if(reqQ>0){
      if(Q >= reqQ) res.findings.push({level:'ok', text:`Operating flow ${Q.toFixed(1)} m³/h meets required ${reqQ.toFixed(1)} m³/h (margin ${((Q/reqQ-1)*100).toFixed(1)}%).`});
      else{
        res.findings.push({level:'fail', text:`Operating flow ${Q.toFixed(1)} m³/h is ${((1-Q/reqQ)*100).toFixed(1)}% below required ${reqQ.toFixed(1)} m³/h (bottleneck).`});
        let lo=n, hi=1.5, found=null;
        const f2 = x => opPoint(s,pts,coef,x);
        const top = f2(hi);
        if(top!==null && top>=reqQ){
          for(let j=0;j<60;j++){ const mid=0.5*(lo+hi); const q=f2(mid); if(q!==null && q>=reqQ) hi=mid; else lo=mid; }
          found = hi;
          res.speedNeeded = found;
          res.findings.push({level:'warn', text:`Affinity-law estimate: speed ratio ≈ ${found.toFixed(3)} (×rated) would deliver the required flow; check driver power, NPSH and mechanical limits.`});
        } else res.findings.push({level:'warn', text:'Speed increase alone cannot reach the required flow within a 1.5× speed ratio; consider larger impeller, parallel pump or lower line losses.'});
        if(res.fricShare > 0.4) res.findings.push({level:'warn', text:`Friction is ${(res.fricShare*100).toFixed(0)}% of system head at the operating point; larger pipe or fewer fittings would raise flow.`});
      }
    }
    if(res.npshRatio < crit.npshRatio) res.findings.push({level:'fail', text:`NPSHa/NPSHr = ${res.npshRatio.toFixed(2)} is below the ${crit.npshRatio} margin criterion; cavitation risk. Raise suction level, enlarge suction line or cut suction losses.`});
    else res.findings.push({level:'ok', text:`NPSHa/NPSHr = ${res.npshRatio.toFixed(2)} meets the ${crit.npshRatio} margin criterion.`});
    if(res.bepRatio < crit.porLow/100 || res.bepRatio > crit.porHigh/100) res.findings.push({level:'warn', text:`Operating flow is ${(res.bepRatio*100).toFixed(0)}% of BEP, outside the ${crit.porLow}-${crit.porHigh}% preferred band; check vendor allowable operating region.`});
    else res.findings.push({level:'ok', text:`Operating flow is ${(res.bepRatio*100).toFixed(0)}% of BEP, inside the ${crit.porLow}-${crit.porHigh}% preferred band.`});
    if(res.Vd > crit.vLiq) res.findings.push({level:'warn', text:`Discharge velocity ${res.Vd.toFixed(2)} m/s exceeds ${crit.vLiq} m/s criterion.`});
    if(res.Vs > crit.vSuc) res.findings.push({level:'warn', text:`Suction velocity ${res.Vs.toFixed(2)} m/s exceeds ${crit.vSuc} m/s criterion.`});
    return res;
  }
  function liqScan(p, f, Qm3h, vmax, dpmax){
    return NPS.map(s=>{
      const l = liqLoss(Qm3h/3600, Object.assign({}, p, {D:s.id/1000}), f);
      const dp100 = l.dP/BAR*100/p.L;
      return {nps:s.nps, id:s.id, V:l.V, dp100, pass: l.V<=vmax && dp100<=dpmax};
    });
  }
  return {G, ATM, BAR, NPS, friction, gasSolve, gasPass, gasMaxFlow, gasScan, liqLoss, fitQuad, interp, pumpHead, sysHead, opPoint, pumpAnalyse, liqScan};
})();
if (typeof module !== 'undefined') module.exports = PHW_CORE;
