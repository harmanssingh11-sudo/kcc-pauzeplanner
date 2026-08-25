(()=>{
  'use strict';
  let collapsed=false;
  try{collapsed=localStorage.getItem('kcc_allowlist_collapsed')==='1'}catch(e){}
  function apply(){
    const body=document.getElementById('allowlistPanelBody');
    const btn=document.getElementById('toggleAllowlist');
    if(!body)return;
    body.style.display=collapsed?'none':'';
    if(btn)btn.textContent=collapsed?'▸ Uitklappen':'▾ Inklappen';
  }
  function init(){
    apply();
    const btn=document.getElementById('toggleAllowlist');
    if(btn)btn.onclick=()=>{
      collapsed=!collapsed;
      try{localStorage.setItem('kcc_allowlist_collapsed',collapsed?'1':'0')}catch(e){}
      apply();
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
