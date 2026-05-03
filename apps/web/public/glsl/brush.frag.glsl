#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec4 u_color;
uniform sampler2D u_mask;
uniform sampler2D u_selectionMask;
uniform bool u_maskEnabled;
uniform int u_brushStyle;
uniform float u_brushSize;
uniform bool u_selectionEnabled;
uniform int u_selectionShape;
uniform bool u_selectionInverted;
uniform vec4 u_selectionBounds;
uniform int u_selectionPointCount;
uniform vec2 u_selectionPoints[128];
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
  float blur = clamp(u_filterBlur / max(u_brushSize, 1.0), 0.0, 0.45);

  if (u_brushStyle == 1) {
    return 1.0 - smoothstep(0.56 + edgeNoise * 0.08 - blur, 0.98 + edgeNoise * 0.04, across);
  }

  if (u_brushStyle == 2) {
    return 1.0 - smoothstep(0.66 + edgeNoise * 0.03 - blur, 1.0, across);
  }

  if (u_brushStyle == 3) {
    return 1.0 - smoothstep(0.78 - blur, 1.0, across);
  }

  if (u_brushStyle == 4) {
    return 1.0 - smoothstep(0.84 - blur, 1.0, across);
  }

  return 1.0 - smoothstep(0.72 - blur, 1.0, across);
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

bool isInsideSelectionLasso(vec2 layerCoord) {
  bool inside = false;
  vec2 previous = u_selectionPoints[0];

  for (int index = 0; index < 128; index += 1) {
    if (index >= u_selectionPointCount) {
      break;
    }

    previous = u_selectionPoints[index];
  }

  for (int index = 0; index < 128; index += 1) {
    if (index >= u_selectionPointCount) {
      break;
    }

    vec2 current = u_selectionPoints[index];
    float deltaY = previous.y - current.y;
    bool intersects =
      (current.y > layerCoord.y) != (previous.y > layerCoord.y) &&
      layerCoord.x <
        ((previous.x - current.x) * (layerCoord.y - current.y)) /
          (abs(deltaY) > 0.000001 ? deltaY : 0.000001) +
          current.x;

    if (intersects) {
      inside = !inside;
    }

    previous = current;
  }

  return inside;
}

float selectionClipMask(vec2 layerCoord) {
  if (!u_selectionEnabled) {
    return 1.0;
  }

  vec2 minPoint = u_selectionBounds.xy;
  vec2 maxPoint = u_selectionBounds.xy + u_selectionBounds.zw;
  bool insideRect =
    layerCoord.x >= minPoint.x &&
    layerCoord.x <= maxPoint.x &&
    layerCoord.y >= minPoint.y &&
    layerCoord.y <= maxPoint.y;
  bool inside = insideRect;

  if (u_selectionShape == 1 && insideRect) {
    vec2 center = u_selectionBounds.xy + u_selectionBounds.zw * 0.5;
    vec2 radius = max(u_selectionBounds.zw * 0.5, vec2(0.0001));
    vec2 normalized = (layerCoord - center) / radius;

    inside = dot(normalized, normalized) <= 1.0;
  }

  if (u_selectionShape == 2) {
    inside = insideRect && u_selectionPointCount >= 3 && isInsideSelectionLasso(layerCoord);
  }

  if (u_selectionShape == 3 && insideRect) {
    vec2 selectionCoord =
      (layerCoord - minPoint) / max(u_selectionBounds.zw, vec2(0.0001));

    inside = texture2D(u_selectionMask, selectionCoord).r > 0.5;
  }

  if (u_selectionInverted) {
    inside = !inside;
  }

  return inside ? 1.0 : 0.0;
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
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_maskCoord).r : 1.0;
  float selectionValue = selectionClipMask(v_maskCoord);

  float along = v_strokeCoord.x;
  float across = abs(v_strokeCoord.y * 2.0 - 1.0);

  float body = edgeShape(along, across);
  float textureValue = brushTexture(along, across);
  float paper = mix(0.97, 1.0, grain(v_worldCoord / (84.0 + u_brushSize * 3.0), 72.0));

  float alpha = u_color.a * maskValue * selectionValue * body * textureValue * paper;

  gl_FragColor = vec4(applyFilters(u_color.rgb), clamp(alpha, 0.0, 1.0));
}
