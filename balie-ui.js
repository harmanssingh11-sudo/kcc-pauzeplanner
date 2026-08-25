(()=>{
  'use strict';
  const OPTIONS=[['Webcare','Webcare'],['KCC','KCC'],['Balie','Balie']];
  function optionsMatch(select,opts){
    const current=Array.from(select.options).map(o=>o.value);
    const target=opts.map(([value])=>value);
    return current.length===target.length&&current.every((v,i)=>v===target[i]);
  }
  function setOptions(select){
    if(!select||optionsMatch(select,OPTIONS))return;
    const current=select.value;
    select.innerHTML=OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(OPTIONS.some(([value])=>value===current))select.value=current;
    else if(current==='')select.value='KCC';
  }
  function apply(){
    document.querySelectorAll('select.typeInput').forEach(setOptions);
    document.querySelectorAll('select.dayType').forEach(select=>{
      const profileType=select.closest('.profileBox')?.querySelector('select.typeInput')?.value||'KCC';
      const opts=[['',`Profieltype (${profileType})`],...OPTIONS];
      if(optionsMatch(select,opts))return;
      const current=select.value;
      select.innerHTML=opts.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      select.value=opts.some(([value])=>value===current)?current:'';
    });
  }
  function init(){
    apply();
    const body=document.getElementById('peopleBody');
    // 'apply' zelf herschrijft <option>-elementen — zonder de optionsMatch-guard
    // hierboven zou elke aanroep hier weer een childList-mutatie triggeren die de
    // observer opnieuw aanroept, in een oneindige lus die het tabblad volledig
    // laat vastlopen (klikken werkte nergens meer onder Werkprofielen). De guard
    // zorgt dat een aanroep die niets hoeft te wijzigen ook niets muteert, dus
    // de lus stopt vanzelf na de eerste (echte) aanpassing.
    if(body)new MutationObserver(apply).observe(body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
