#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec4 u_color;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform int u_brushStyle;
uniform float u_brushSize;

varying vec2 v_maskCoord;
varying vec2 v_strokeCoord;
varying vec2 v_worldCoord;

float hash(vec2 value) {
  vec2 p = fract(value * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float grain(vec2 texCoord, float scale) {
  return hash(floor(texCoord * scale));
}

float edgeShape(float along, float across) {
  float edgeNoise = grain(vec2(along * 0.12, across * 10.0), 24.0) - 0.5;

  if (u_brushStyle == 1) {
    return 1.0 - smoothstep(0.56 + edgeNoise * 0.08, 0.98 + edgeNoise * 0.04, across);
  }

  if (u_brushStyle == 2) {
    return 1.0 - smoothstep(0.66 + edgeNoise * 0.03, 1.0, across);
  }

  if (u_brushStyle == 3) {
    return 1.0 - smoothstep(0.78, 1.0, across);
  }

  if (u_brushStyle == 4) {
    return 1.0 - smoothstep(0.84, 1.0, across);
  }

  return 1.0 - smoothstep(0.72, 1.0, across);
}

float brushTexture(float along, float across) {
  if (u_brushStyle == 1) {
    float graphite = grain(vec2(along * 0.32, across * 8.0), 46.0 + u_brushSize * 0.6);
    float tooth = grain(v_worldCoord / (70.0 + u_brushSize * 2.5), 64.0);
    return mix(0.74, 1.0, graphite) * mix(0.9, 1.0, tooth);
  }

  if (u_brushStyle == 2) {
    float bristle = grain(vec2(along * 0.18, across * 5.5), 30.0 + u_brushSize * 0.35);
    float streak = grain(vec2(along * 0.48, across * 1.8), 18.0);
    return mix(0.78, 1.0, bristle) * mix(0.88, 1.0, streak);
  }

  if (u_brushStyle == 3) {
    float markerFiber = grain(vec2(along * 0.22, across * 3.0), 18.0 + u_brushSize * 0.2);
    return mix(0.94, 1.0, markerFiber);
  }

  if (u_brushStyle == 4) {
    float streak = grain(vec2(along * 0.38, across * 1.2), 12.0);
    return mix(0.82, 1.0, streak);
  }

  return 1.0;
}

void main() {
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_maskCoord).r : 1.0;

  float along = v_strokeCoord.x;
  float across = abs(v_strokeCoord.y * 2.0 - 1.0);

  float body = edgeShape(along, across);
  float textureValue = brushTexture(along, across);
  float paper = mix(0.97, 1.0, grain(v_worldCoord / (84.0 + u_brushSize * 3.0), 72.0));

  float alpha = u_color.a * maskValue * body * textureValue * paper;

  gl_FragColor = vec4(u_color.rgb, clamp(alpha, 0.0, 1.0));
}