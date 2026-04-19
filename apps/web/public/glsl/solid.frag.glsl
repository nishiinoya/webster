precision mediump float;

uniform vec4 u_color;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform float u_filterBrightness;
uniform float u_filterBlur;
uniform float u_filterContrast;
uniform float u_filterGrayscale;
uniform float u_filterHue;
uniform float u_filterInvert;
uniform float u_filterSaturation;
uniform float u_filterSepia;
uniform float u_filterShadow;
uniform int u_adjustmentCount;
uniform vec4 u_adjustmentBounds[4];
uniform vec4 u_adjustmentA[4];
uniform vec4 u_adjustmentB[4];
uniform mat3 u_adjustmentInverseMatrix[4];
uniform vec2 u_adjustmentSize[4];

varying vec2 v_texCoord;
varying vec2 v_worldCoord;

float softGeometryAlpha() {
  float blur = min(u_filterBlur, 64.0);

  if (blur <= 0.001) {
    return 1.0;
  }

  vec2 edgeDistance = min(v_texCoord, 1.0 - v_texCoord);
  float edge = min(edgeDistance.x, edgeDistance.y);
  float softness = clamp(blur / 128.0, 0.001, 0.45);

  return smoothstep(0.0, softness, edge);
}

vec3 applyFilterValues(vec3 color, vec4 adjustmentA, vec4 adjustmentB) {
  color += adjustmentA.x;
  color = (color - 0.5) * (1.0 + adjustmentA.y) + 0.5;

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, 1.0 + adjustmentA.z);
  color = mix(color, vec3(luminance), adjustmentA.w);

  float angle = radians(adjustmentB.x);
  float s = sin(angle);
  float c = cos(angle);
  mat3 hueRotation = mat3(
    0.213 + c * 0.787 - s * 0.213,
    0.213 - c * 0.213 + s * 0.143,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 - s * 0.715,
    0.715 + c * 0.285 + s * 0.140,
    0.715 - c * 0.715 + s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.072 - c * 0.072 - s * 0.283,
    0.072 + c * 0.928 + s * 0.072
  );
  color = hueRotation * color;

  vec3 sepiaColor = vec3(
    dot(color, vec3(0.393, 0.769, 0.189)),
    dot(color, vec3(0.349, 0.686, 0.168)),
    dot(color, vec3(0.272, 0.534, 0.131))
  );
  color = mix(color, sepiaColor, adjustmentB.z);
  color = mix(color, vec3(1.0) - color, adjustmentB.y);

  float shadowMask = 1.0 - smoothstep(0.0, 0.65, luminance);
  color += shadowMask * adjustmentB.w;

  return clamp(color, 0.0, 1.0);
}

vec3 applyFilters(vec3 color) {
  color = applyFilterValues(
    color,
    vec4(u_filterBrightness, u_filterContrast, u_filterSaturation, u_filterGrayscale),
    vec4(u_filterHue, u_filterInvert, u_filterSepia, u_filterShadow)
  );

  for (int index = 0; index < 4; index += 1) {
    if (index >= u_adjustmentCount) {
      break;
    }

    vec4 bounds = u_adjustmentBounds[index];
    bool broadInside =
      v_worldCoord.x >= bounds.x &&
      v_worldCoord.x <= bounds.x + bounds.z &&
      v_worldCoord.y >= bounds.y &&
      v_worldCoord.y <= bounds.y + bounds.w;
    vec3 localPosition = u_adjustmentInverseMatrix[index] * vec3(v_worldCoord, 1.0);
    vec2 size = u_adjustmentSize[index];
    bool inside =
      broadInside &&
      localPosition.x >= 0.0 &&
      localPosition.x <= size.x &&
      localPosition.y >= 0.0 &&
      localPosition.y <= size.y;

    if (inside) {
      color = applyFilterValues(color, u_adjustmentA[index], u_adjustmentB[index]);
    }
  }

  return color;
}

void main() {
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_texCoord).r : 1.0;
  gl_FragColor = vec4(applyFilters(u_color.rgb), u_color.a * maskValue * softGeometryAlpha());
}
