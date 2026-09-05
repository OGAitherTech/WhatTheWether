/* ============================================================
   Aither Weather V28 — config.js
   Central configuration. No API keys required, ever.
   ============================================================ */

const WTW_CONFIG = {
  app: {
    name: 'Aither Weather',
    version: 'V28',
    tagline: 'Weather with an attitude problem.',
  },
  defaults: {
    username: '', personality: 'sassy', botBrain: 'local', showRoast: true,
    radarStyle: 'map', radarOpacity: 0.85, radarSpeed: 1, autoRoast: true,
    theme: 'neon-dark', units: 'imperial', clock: '12', alertNotifications: false,
    iconStyle: 'rendered', accent: 'neon', forecastDays: 7, hourlyHours: 24,
    sceneAnimation: true, background: 'animated', cardStyle: 'glass',
    corners: 'round', density: 'comfortable', geminiModel: '',
  },
  api: {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    zip: 'https://api.zippopotam.us/us/', nws: 'https://api.weather.gov',
    archive: 'https://archive-api.open-meteo.com/v1/archive',
    airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    metno: 'https://api.met.no/weatherapi/locationforecast/2.0/complete',
  },
  rain: {
    order: ['nws-grid', 'met-no', 'open-meteo'],
    labels: {'nws-grid':'NWS forecast grid','met-no':'MET Norway','open-meteo':'Open-Meteo'},
  },
  accents: [
    {id:'neon',label:'Neon Green',accent:'#00e08a',accent2:'#00b3ff'},
    {id:'sky',label:'Sky Blue',accent:'#38bdf8',accent2:'#6366f1'},
    {id:'violet',label:'Violet',accent:'#a78bfa',accent2:'#ec4899'},
    {id:'amber',label:'Amber',accent:'#fbbf24',accent2:'#fb7185'},
    {id:'rose',label:'Rose',accent:'#fb7185',accent2:'#a78bfa'},
    {id:'mint',label:'Mint',accent:'#34d399',accent2:'#22d3ee'},
  ],
  botBrains: [{id:'local',label:'Built-in (no key needed)'},{id:'gemini',label:'Google Gemini (your key)'}],
  gemini: {model:'gemini-3.5-flash-lite'},
  geminiModels: [
    {id:'gemini-3.5-flash-lite',label:'Flash Lite 3.5 — fastest, cheapest'},
    {id:'gemini-3.6-flash',label:'Flash 3.6 — slower, thinks first'},
    {id:'gemini-2.5-flash',label:'Flash 2.5 — older'},
  ],
  iconStyles: [{id:'rendered',label:'Rendered'},{id:'emoji',label:'Emoji'}],
  backgrounds: [{id:'animated',label:'Animated sky'},{id:'gradient',label:'Sky colours only'},{id:'off',label:'Plain theme'}],
  radarStyles: [{id:'map',label:'Map — flat, like a weather map'},{id:'scope',label:'Scope — round, with a sweep'}],
  cardStyles: [{id:'glass',label:'Glass'},{id:'solid',label:'Solid'},{id:'outline',label:'Outline'}],
  cornerStyles: [{id:'round',label:'Rounded'},{id:'soft',label:'Soft'},{id:'square',label:'Square'}],
  densities: [{id:'compact',label:'Compact'},{id:'comfortable',label:'Comfortable'},{id:'airy',label:'Airy'}],
  forecastLengths: [5,7,10], hourlyLengths: [12,24,48],
  unitSystems: [{id:'imperial',label:'Imperial (°F, mph)'},{id:'metric',label:'Metric (°C, km/h)'}],
  nowcast: {enabled:true,lookaheadMinutes:120,minutelyResolution:15},
  auth: {
    google:{clientId:'',setupUrl:'https://console.cloud.google.com/apis/credentials'},
    microsoft:{clientId:'',tenant:'common',setupUrl:'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'},
    apple:{clientId:'',redirectUri:'',setupUrl:'https://developer.apple.com/account/resources/identifiers/list/serviceId'},
  },
  repo: {
    owner:'OGAitherTech', name:'WhatTheWether',
    get url(){return `https://github.com/${this.owner}/${this.name}`;},
    get releasesUrl(){return `${this.url}/releases`;},
    get latestApi(){return `https://api.github.com/repos/${this.owner}/${this.name}/releases/latest`;},
  },
  search:{maxResults:6,maxRecent:6}, compare:{maxLocations:8},
  radarTiles:{enabled:true,indexUrl:'https://api.rainviewer.com/public/weather-maps.json',frameCount:8,forecastFrames:3,tileSize:256,colorScheme:4,smooth:true,showSnow:true,maxAgeMinutes:30},
  radarImagery:{enabled:true,wmsBase:'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',layer:'conus_bref_qcd',rangeKm:150,imageSize:512,frameCount:6,frameStepMin:10},
  nwsQuality:{maxStationKm:40,maxObsAgeMinutes:90},
  weather:{forecastDays:7,forecastHours:48,temperatureUnit:'fahrenheit',windSpeedUnit:'mph',precipitationUnit:'inch'},
  map:{enabled:true,tileDark:'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',tileLight:'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors © CARTO',minRangeKm:40,maxRangeKm:400,zoomSteps:[40,75,150,250,400]},
  radar:{fullscreenOnTap:true,frameMinutes:60,sweepSecondsPerRev:4,maxStormCells:7,framePlaybackMs:750},
  personalities:['friendly','sassy','rude','brutal','deadpan','doomer'],
  themes:[{id:'neon-dark',label:'Neon Dark'},{id:'midnight',label:'Midnight'},{id:'light',label:'Light'}],
  roastLog:{maxEntries:50}, storagePrefix:'wtw:', legacyStoragePrefixes:['wtw9:','wtw8:'],
};
window.WTW_CONFIG = WTW_CONFIG;

/* Official NOAA/NCEI NEXRAD network layer.
   This is the NCEI WMS published for the NEXRAD Level-II dataset. It is
   deliberately shown as an official NEXRAD network layer, separate from
   the existing live precipitation animation, because the NCEI layer is
   not the same thing as a national reflectivity mosaic. */
(() => {
  'use strict';
  const WMS = 'https://gis.ncdc.noaa.gov/arcgis/services/cdo/nexrad/MapServer/WMSServer';
  const DATASET = 'https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc:C00345';
  const $ = id => document.getElementById(id);
  let lastKey = '';

  function ensurePanel() {
    if ($('nceiRadarPanel')) return $('nceiRadarPanel');
    const host = $('radar');
    if (!host || !host.parentElement) return null;
    const style = document.createElement('style');
    style.textContent = '#nceiRadarPanel{margin-top:12px;padding:14px 16px 16px;border:1px solid var(--card-border,rgba(255,255,255,.14));border-radius:18px;background:rgba(0,0,0,.12)}.ncei-radar-head{margin-bottom:10px}.ncei-radar-title{font-size:14px;font-weight:700}.ncei-radar-meta{font-size:11px;opacity:.68}.ncei-radar-map{position:relative;min-height:220px;border-radius:14px;overflow:hidden;background:#07101d;border:1px solid rgba(255,255,255,.09)}.ncei-radar-map img{display:block;width:100%;height:100%;min-height:220px;object-fit:cover}.ncei-radar-loading,.ncei-radar-error{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;font-size:13px;background:rgba(4,10,18,.62);backdrop-filter:blur(4px)}.ncei-radar-error{color:#ffb3bd}.ncei-radar-links{display:flex;justify-content:space-between;gap:8px;margin-top:9px;font-size:11px}.ncei-radar-links a{color:var(--accent-2,#00c8ff)}@media(max-width:640px){.ncei-radar-map,.ncei-radar-map img{min-height:190px}.ncei-radar-links{flex-direction:column}}';
    document.head.appendChild(style);
    const panel = document.createElement('section');
    panel.id = 'nceiRadarPanel';
    panel.innerHTML = '<div class="ncei-radar-head"><div><div class="ncei-radar-title">NOAA NEXRAD • NCEI</div><div class="ncei-radar-meta">Official NEXRAD network layer</div></div></div><div class="ncei-radar-map" id="nceiRadarMap"><div class="ncei-radar-loading" id="nceiRadarLoading">Choose a location to load the NCEI NEXRAD layer.</div></div><div class="ncei-radar-links"><a href="'+DATASET+'" target="_blank" rel="noopener noreferrer">Open NCEI dataset</a><a href="'+WMS+'?request=GetCapabilities&service=WMS" target="_blank" rel="noopener noreferrer">NCEI WMS capabilities</a></div>';
    host.parentElement.appendChild(panel);
    return panel;
  }

  function update(loc) {
    if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon))) return;
    const lat = Math.max(-80, Math.min(80, Number(loc.lat)));
    const lon = Number(loc.lon);
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (key === lastKey) return;
    const panel = ensurePanel();
    const map = $('nceiRadarMap');
    if (!panel || !map) return;
    lastKey = key;
    const halfLat = 7;
    const cos = Math.max(.35, Math.cos(lat * Math.PI / 180));
    const halfLon = Math.min(12, halfLat / cos);
    const bbox = [lon-halfLon,lat-halfLat,lon+halfLon,lat+halfLat].join(',');
    const width = Math.max(640, Math.min(1200, Math.round((map.clientWidth || 900) * (window.devicePixelRatio || 1))));
    const height = Math.max(360, Math.min(800, Math.round(width * .62)));
    const p = new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',layers:'0',styles:'',format:'image/png',transparent:'true',srs:'EPSG:4326',bbox,width:String(width),height:String(height)});
    const loading = $('nceiRadarLoading');
    if (loading) { loading.className='ncei-radar-loading'; loading.textContent='Loading NOAA NEXRAD…'; loading.hidden=false; }
    const old = map.querySelector('img'); if (old) old.remove();
    const img = document.createElement('img');
    img.alt = `NOAA NEXRAD network near ${loc.name || 'current location'}`;
    img.loading = 'lazy'; img.src = `${WMS}?${p.toString()}`;
    img.onload = () => { if (loading) loading.hidden=true; };
    img.onerror = () => { if (loading) { loading.className='ncei-radar-error'; loading.textContent='NCEI NEXRAD layer could not be loaded right now. The main live radar remains available above.'; loading.hidden=false; } };
    map.appendChild(img);
  }

  function tick() {
    try {
      const loc = window.WTWStorage && WTWStorage.getLastLocation && WTWStorage.getLastLocation();
      if (loc) update(loc);
    } catch (_) {}
  }
  function init() { tick(); setInterval(tick, 1000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
  window.AitherNCEIRadar = {update};
})();
