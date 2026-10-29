(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppetPinchMarks = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var serial = 0;
  var namespace = 'pm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name + ' must be a finite number');
    return value;
  }
  function toHex(channels) {
    return '#' + channels.map(function (v) { return Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0'); }).join('');
  }
  function palette(hex) {
    // Check length too: JavaScript's $ may otherwise match before a final newline.
    if (typeof hex !== 'string' || hex.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      throw new TypeError('color must be a six-digit #RRGGBB hex string');
    }
    var base = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    return {
      base: hex.toLowerCase(),
      shadow: toHex(base.map(function (v, i) { return v * [0.87, 0.83, 0.80][i]; })),
      deep: toHex(base.map(function (v, i) { return v * [0.74, 0.67, 0.63][i]; })),
      light: toHex(base.map(function (v, i) { return v + (Math.max(v, [255, 253, 249][i]) - v) * 0.32; })),
      blush: toHex(base.map(function (v, i) { return v * [0.99, 0.94, 0.92][i]; }))
    };
  }

  function markup(hex, options) {
    var p = palette(hex);
    options = options === undefined ? {} : options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
    var opacity = options.opacity === undefined ? 0.85 : clamp(finite(options.opacity, 'opacity'), 0, 1);
    var frame = options.frame === undefined ? 3 : options.frame;
    if (!Number.isInteger(frame) || frame < 0 || frame > 7) throw new RangeError('frame must be 0–7');
    var squeeze = [0, .25, .6, .88, .78, 1, .42, .08][frame];
    var lift = [0, 0, 0, 0, -1, 1, 0, 0][frame];
    // Rounded, short cheek fold. The pinched neck has volume between the
    // finger pads; no single sharp tip or long triangular "skin ribbon".
    var upper=27+3*squeeze+lift,lower=53-3*squeeze+lift;
    var skinPath = 'M13 '+upper+' Q2 40 13 '+lower+' C27 56 35 51 47 56 C75 67 109 72 160 70 L160 10 C109 8 75 13 47 24 C35 29 27 24 13 '+upper+'Z';
    var id = namespace + '-' + (++serial);
    // Left pinch tip (13,40), face root (150,40). The right edge fades into the face.
    // Keep these groups independent so the skin patch can retreat before creases disappear.
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" preserveAspectRatio="none" aria-hidden="true" focusable="false" opacity="' + opacity + '">' +
      '<defs>' +
        '<linearGradient id="' + id + '-fade" x1="0" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity="1"/>' +
          '<stop offset="0.36" stop-color="#ffffff" stop-opacity="1"/>' +
          '<stop offset="0.66" stop-color="#ffffff" stop-opacity="0.5"/>' +
          '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<mask id="' + id + '-blend" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="80" style="mask-type:alpha">' +
          '<rect width="160" height="80" fill="url(#' + id + '-fade)"/>' +
        '</mask>' +
        '<linearGradient id="' + id + '-shade" x1="0" y1="21" x2="0" y2="65" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="' + p.shadow + '" stop-opacity="0.22"/>' +
          '<stop offset="0.38" stop-color="' + p.base + '" stop-opacity="0"/>' +
          '<stop offset="0.69" stop-color="' + p.base + '" stop-opacity="0"/>' +
          '<stop offset="1" stop-color="' + p.shadow + '" stop-opacity="0.18"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<g class="pm-skin" mask="url(#' + id + '-blend)">' +
        '<path d="'+skinPath+'" fill="' + p.base + '"/>' +
        '<path d="'+skinPath+'" fill="url(#' + id + '-shade)"/>' +
        '<ellipse cx="23" cy="40" rx="12" ry="7" fill="' + p.light + '" opacity="0.18"/>' +
      '</g>' +
      '<g class="pm-creases" transform="translate(0 '+(40*squeeze*.2+lift)+') scale(1 '+(1-squeeze*.2)+')" mask="url(#' + id + '-blend)" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M10 29 Q23 24 39 29 M10 51 Q23 57 39 51" fill="none" stroke="' + p.shadow + '" stroke-width="2.4" opacity="0.5"/>' +
        '<path d="M35 29 Q49 26 60 21 M35 51 Q48 54 60 59" fill="none" stroke="' + p.shadow + '" stroke-width="1.4" opacity="0.24"/>' +
      '</g></svg>';
  }

  // Apply the returned transform around the element center (the CSS default).
  // Sizes are CSS pixels. Only height scales; the horizontal tip/root anchors stay fixed.
  function geometry(anchor, baseSize, pull, mirror, scale) {
    if (!anchor || typeof anchor !== 'object') throw new TypeError('anchor must contain finite x and y');
    var x = finite(anchor.x, 'anchor.x'), y = finite(anchor.y, 'anchor.y');
    baseSize = finite(baseSize, 'baseSize');
    pull = finite(pull, 'pull');
    scale = scale === undefined ? 1 : finite(scale, 'scale');
    if (baseSize <= 0) throw new RangeError('baseSize must be positive');
    if (pull < 0) throw new RangeError('pull must not be negative');
    if (scale <= 0) throw new RangeError('scale must be positive');
    if (typeof mirror !== 'boolean') throw new TypeError('mirror must be boolean');
    baseSize = clamp(baseSize, 1, 20000);
    pull = clamp(pull, 0, baseSize * 4);
    scale = clamp(scale, 0.05, 4);
    var width = (baseSize * 0.2 + pull) / (137 / 160);
    var height = baseSize * 0.13 * scale;
    var rootX = x + (mirror ? -1 : 1) * baseSize * 0.2;
    return {
      left: rootX - width * (mirror ? 10 / 160 : 150 / 160),
      top: y - height / 2,
      width: width,
      height: height,
      transform: mirror ? 'scaleX(-1)' : 'none'
    };
  }

  function pressureMarkup(hex, points, width, height, scale) {
    var p=palette(hex);finite(width,'width');finite(height,'height');finite(scale,'scale');
    if(width<=0||height<=0||scale<.5||scale>2||!Array.isArray(points)||points.length!==2)throw new RangeError('contact geometry invalid');
    var id=namespace+'-pressure-'+(++serial);
    var flush=toHex([1,3,5].map(function(i,n){return parseInt(p.base.slice(i,i+2),16)*[.98,.82,.79][n];}));
    var defs='<defs><radialGradient id="'+id+'-skin"><stop offset="0" stop-color="'+p.base+'" stop-opacity=".66"/><stop offset=".4" stop-color="'+p.base+'" stop-opacity=".38"/><stop offset="1" stop-color="'+p.base+'" stop-opacity="0"/></radialGradient><radialGradient id="'+id+'-shade"><stop offset=".08" stop-color="'+p.deep+'" stop-opacity="0"/><stop offset=".40" stop-color="'+p.deep+'" stop-opacity=".72"/><stop offset=".65" stop-color="'+p.shadow+'" stop-opacity=".45"/><stop offset="1" stop-color="'+p.shadow+'" stop-opacity="0"/></radialGradient><radialGradient id="'+id+'-flush"><stop offset="0" stop-color="'+flush+'" stop-opacity=".42"/><stop offset=".5" stop-color="'+flush+'" stop-opacity=".24"/><stop offset="1" stop-color="'+flush+'" stop-opacity="0"/></radialGradient></defs>';
    var rims='',shadows='';
    points.forEach(function(point){
      finite(point.x,'point.x');finite(point.y,'point.y');finite(point.angle,'point.angle');
      if(point.x<0||point.x>1||point.y<0||point.y>1)throw new RangeError('contact point invalid');
      var x=point.x*width,y=point.y*height,rx=width*.040*scale,ry=width*.020*scale;
      var attrs=' cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" transform="rotate('+point.angle+' '+x+' '+y+')"';
      rims+='<ellipse class="pm-pad-rim"'+attrs+' fill="url(#'+id+'-skin)"/>';
      shadows+='<ellipse class="pm-pad-flush" cx="'+(x+rx*.30)+'" cy="'+y+'" rx="'+rx*1.35+'" ry="'+ry*1.4+'" fill="url(#'+id+'-flush)"/><ellipse class="pm-pad-shadow"'+attrs+' fill="url(#'+id+'-shade)"/>';
      shadows+='<g transform="translate('+x+' '+y+') rotate('+point.angle+')"><path class="pm-pressure-crease" d="M'+rx*.08+' '+(-ry*.58)+' Q'+rx*.67+' 0 '+rx*.08+' '+ry*.58+'" fill="none" stroke="'+p.deep+'" stroke-opacity=".72" stroke-width="'+width*.003*scale+'" stroke-linecap="round"/><path class="pm-pressure-light" d="M'+rx*.27+' '+(-ry*.68)+' Q'+rx*.88+' 0 '+rx*.27+' '+ry*.68+'" fill="none" stroke="'+p.light+'" stroke-opacity=".60" stroke-width="'+width*.002*scale+'" stroke-linecap="round"/></g>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" aria-hidden="true">'+defs+'<g class="pm-skin">'+rims+'</g><g class="pm-creases">'+shadows+'</g></svg>';
  }
  return { palette: palette, markup: markup, geometry: geometry, pressureMarkup:pressureMarkup };
}));
