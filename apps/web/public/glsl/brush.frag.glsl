precision mediump float;

uniform vec4 u_color;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform int u_brushStyle;
uniform float u_brushSize;

varying vec2 v_brushCoord;
varying vec2 v_texCoord;

float hash(vec2 value) {
  vec2 p = fract(value * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float grain(vec2 texCoord, float scale) {
  return hash(floor(texCoord * scale));
}

float brushAlpha(vec2 texCoord) {
  if (u_brushStyle == 1) {
    float fineGrain = grain(texCoord, 1150.0 + u_brushSize * 24.0);
    float fiber = hash(vec2(
      floor(texCoord.x * 260.0),
      floor((texCoord.y + texCoord.x * 0.18) * 82.0)
    ));
    return mix(0.76, 1.0, fineGrain) * mix(0.86, 1.0, fiber);
  }

  if (u_brushStyle == 2) {
    float bristle = hash(vec2(
      floor((texCoord.x + texCoord.y * 0.13) * 120.0),
      floor(texCoord.y * 36.0)
    ));
    float softGrain = grain(texCoord, 240.0 + u_brushSize * 7.0);
    return mix(0.82, 1.0, bristle) * mix(0.9, 1.0, softGrain);
  }

  if (u_brushStyle == 3) {
    float density = grain(texCoord, 280.0 + u_brushSize * 3.0);
    return mix(0.96, 1.0, density);
  }

  if (u_brushStyle == 4) {
    float streak = hash(vec2(floor(texCoord.x * 85.0), floor(texCoord.y * 24.0)));
    return mix(0.72, 1.0, streak);
  }

  return 1.0;
}

void main() {
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_texCoord).r : 1.0;
  gl_FragColor = vec4(u_color.rgb, u_color.a * maskValue * brushAlpha(v_brushCoord / 256.0));
}
