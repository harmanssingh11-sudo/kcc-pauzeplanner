(()=>{
  'use strict';
  const OPTIONS=[['Webcare','Webcare'],['KCC','KCC'],['Balie','Balie']];
  function setOptions(select){
    if(!select)return;
    const current=select.value;
    select.innerHTML=OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(OPTIONS.some(([value])=>value===current))select.value=current;
    else if(current==='')select.value='KCC';
  }
  function apply(){
    document.querySelectorAll('select.typeInput').forEach(setOptions);
    document.querySelectorAll('select.dayType').forEach(select=>{
      const current=select.value;
      const profileType=select.closest('.profileBox')?.querySelector('select.typeInput')?.value||'KCC';
      const opts=[['',`Profieltype (${profileType})`],...OPTIONS];
      select.innerHTML=opts.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      select.value=opts.some(([value])=>value===current)?current:'';
    });
  }
  function init(){
    apply();
    const body=document.getElementById('peopleBody');
    if(body)new MutationObserver(apply).observe(body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
