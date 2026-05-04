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
uniform sampler2D u_importedTexture;
uniform float u_importedTextureBlend;
uniform bool u_importedTextureEnabled;
uniform sampler2D u_baseColorTexture;
uniform bool u_baseColorTextureEnabled;
uniform vec3 u_emissiveColor;
uniform sampler2D u_emissiveTexture;
uniform bool u_emissiveTextureEnabled;
uniform bool u_glossinessTextureEnabled;
uniform float u_lightIntensity;
uniform vec3 u_lightPosition;
uniform int u_materialAlphaMode;
uniform float u_materialMetallic;
uniform float u_materialRoughness;
uniform float u_materialShininess;
uniform vec3 u_materialSpecularColor;
uniform sampler2D u_metallicTexture;
uniform int u_metallicTextureChannel;
uniform bool u_metallicTextureEnabled;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform vec4 u_materialColor;
uniform sampler2D u_normalTexture;
uniform bool u_normalTextureEnabled;
uniform float u_opacity;
uniform sampler2D u_roughnessTexture;
uniform int u_roughnessTextureChannel;
uniform bool u_roughnessTextureEnabled;
uniform sampler2D u_specularTexture;
uniform bool u_specularTextureEnabled;
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
varying vec4 v_color;
varying vec3 v_normal;
varying vec3 v_position3D;
varying vec3 v_tangent;
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

float sampleTextureChannel(sampler2D textureSampler, vec2 texCoord, int channel) {
  vec4 value = texture2D(textureSampler, texCoord);

  if (channel == 1) {
    return value.g;
  }

  if (channel == 2) {
    return value.b;
  }

  if (channel == 3) {
    return value.a;
  }

  return value.r;
}

vec4 applyTexture(vec4 color) {
  vec4 material = color;

  if (u_baseColorTextureEnabled) {
    material *= texture2D(u_baseColorTexture, v_texCoord);
  }

  if (u_importedTextureEnabled) {
    vec4 importedColor = texture2D(u_importedTexture, v_texCoord);
    vec4 texturedColor = vec4(material.rgb * importedColor.rgb, material.a * importedColor.a);

    material = mix(material, texturedColor, u_importedTextureBlend);
  }

  if (u_textureKind <= 0 || u_textureBlend <= 0.001 || u_textureKind == 5) {
    return material;
  }

  float pattern = texturePattern(v_texCoord);
  float contrastedPattern = clamp(0.5 + (pattern - 0.5) * (1.0 + u_textureContrast * 2.0), 0.0, 1.0);
  vec3 texturedColor = mix(material.rgb, u_textureColor.rgb, contrastedPattern * u_textureColor.a);

  material.rgb = mix(material.rgb, texturedColor, u_textureBlend);

  return material;
}

vec3 getSurfaceNormal(vec3 normal) {
  if (!u_normalTextureEnabled) {
    return normal;
  }

  vec3 tangent = normalize(v_tangent - normal * dot(normal, v_tangent));

  if (length(tangent) < 0.001) {
    return normal;
  }

  vec3 bitangent = normalize(cross(normal, tangent));
  vec3 mappedNormal = texture2D(u_normalTexture, v_texCoord).xyz * 2.0 - 1.0;

  return normalize(mat3(tangent, bitangent, normal) * mappedNormal);
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

  vec3 normal = getSurfaceNormal(normalize(v_normal));
  vec3 lightDirection = normalize(u_lightPosition - v_position3D);
  vec3 viewDirection = normalize(vec3(0.0, 0.0, 5.0) - v_position3D);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float roughness = clamp(u_materialRoughness, 0.02, 1.0);
  float metallic = clamp(u_materialMetallic, 0.0, 1.0);

  if (u_roughnessTextureEnabled) {
    roughness *= sampleTextureChannel(u_roughnessTexture, v_texCoord, u_roughnessTextureChannel);
    roughness = clamp(roughness, 0.02, 1.0);
  }

  if (u_glossinessTextureEnabled) {
    roughness = clamp(1.0 - texture2D(u_roughnessTexture, v_texCoord).r, 0.02, 1.0);
  }

  if (u_metallicTextureEnabled) {
    metallic *= sampleTextureChannel(u_metallicTexture, v_texCoord, u_metallicTextureChannel);
    metallic = clamp(metallic, 0.0, 1.0);
  }

  vec3 specularColor = u_materialSpecularColor;

  if (u_specularTextureEnabled) {
    specularColor *= texture2D(u_specularTexture, v_texCoord).rgb;
  }

  float specularPower = max(2.0, u_materialShininess > 0.0 ? u_materialShininess : mix(96.0, 8.0, roughness));
  float specularStrength = mix(max(max(specularColor.r, specularColor.g), specularColor.b), 0.72, metallic);
  float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower) * specularStrength * u_lightIntensity;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.4) * 0.2;
  vec4 material = applyTexture(u_materialColor * v_color);

  if (u_materialAlphaMode == 1 && material.a < 0.5) {
    discard;
  }

  vec3 lit = material.rgb * clamp(u_ambient + diffuse * u_lightIntensity, 0.0, 1.8);
  vec3 emission = u_emissiveColor;

  if (u_emissiveTextureEnabled) {
    emission += texture2D(u_emissiveTexture, v_texCoord).rgb;
  }

  lit += specularColor * specular + vec3(rim) + emission;
  gl_FragColor = vec4(applyFilters(lit), material.a * u_opacity * maskValue);
}
