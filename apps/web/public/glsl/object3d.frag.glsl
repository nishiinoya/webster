precision mediump float;

uniform float u_ambient;
uniform float u_filterBrightness;
uniform float u_filterContrast;
uniform float u_filterGrayscale;
uniform float u_filterHue;
uniform float u_filterInvert;
uniform float u_filterSaturation;
uniform float u_filterSepia;
uniform float u_filterShadow;
uniform float u_lightIntensity;
uniform vec3 u_lightPosition;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform vec4 u_materialColor;
uniform float u_opacity;
uniform float u_textureBlend;
uniform vec4 u_textureColor;
uniform float u_textureContrast;
uniform int u_textureKind;
uniform float u_textureScale;
uniform int u_adjustmentCount;
uniform vec4 u_adjustmentBounds[4];
uniform vec4 u_adjustmentA[4];
uniform vec4 u_adjustmentB[4];
uniform mat3 u_adjustmentInverseMatrix[4];
uniform vec2 u_adjustmentSize[4];

varying vec2 v_layerTexCoord;
varying vec3 v_normal;
varying vec3 v_position3D;
varying vec2 v_texCoord;
varying vec2 v_worldCoord;

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

float texturePattern(vec2 texCoord) {
  if (u_textureKind <= 0) {
    return 0.0;
  }

  vec2 uv = texCoord * max(1.0, u_textureScale);

  if (u_textureKind == 1) {
    return mod(floor(uv.x) + floor(uv.y), 2.0);
  }

  if (u_textureKind == 2) {
    return step(0.5, fract((uv.x + uv.y) * 0.5));
  }

  if (u_textureKind == 3) {
    vec2 cell = fract(uv) - 0.5;
    return 1.0 - smoothstep(0.18, 0.26, length(cell));
  }

  vec2 grainCell = floor(uv);

  return fract(sin(dot(grainCell, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 applyTexture(vec3 color) {
  if (u_textureKind <= 0 || u_textureBlend <= 0.001) {
    return color;
  }

  float pattern = texturePattern(v_texCoord);
  float contrastedPattern = clamp(0.5 + (pattern - 0.5) * (1.0 + u_textureContrast * 2.0), 0.0, 1.0);
  vec3 texturedColor = mix(color, u_textureColor.rgb, contrastedPattern * u_textureColor.a);

  return mix(color, texturedColor, u_textureBlend);
}

float sampleMaskValue(vec2 texCoord) {
  if (
    texCoord.x < 0.0 ||
    texCoord.x > 1.0 ||
    texCoord.y < 0.0 ||
    texCoord.y > 1.0
  ) {
    return 0.0;
  }

  return texture2D(u_mask, texCoord).r;
}

void main() {
  if (
    v_layerTexCoord.x < 0.0 ||
    v_layerTexCoord.x > 1.0 ||
    v_layerTexCoord.y < 0.0 ||
    v_layerTexCoord.y > 1.0
  ) {
    discard;
  }

  float maskValue = u_maskEnabled ? sampleMaskValue(v_layerTexCoord) : 1.0;

  if (maskValue <= 0.001) {
    discard;
  }

  vec3 normal = normalize(v_normal);
  vec3 lightDirection = normalize(u_lightPosition - v_position3D);
  vec3 viewDirection = normalize(vec3(0.0, 0.0, 5.0) - v_position3D);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float specular = pow(max(dot(normal, halfDirection), 0.0), 32.0) * 0.28 * u_lightIntensity;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.4) * 0.2;
  vec3 material = applyTexture(u_materialColor.rgb);
  vec3 lit = material * clamp(u_ambient + diffuse * u_lightIntensity, 0.0, 1.8);

  lit += vec3(specular + rim);
  gl_FragColor = vec4(applyFilters(lit), u_materialColor.a * u_opacity * maskValue);
}
