// Chromatic Aberration - CRT RGB shift effect
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screenSize;
uniform float aberrationAmount;

void main(void) {
    vec2 uv = vUV;
    vec2 center = vec2(0.5, 0.5);
    vec2 offset = (uv - center) * 0.001 * aberrationAmount;
    
    // Sample RGB channels with offset (shift increases towards edges)
    float r = texture2D(textureSampler, uv + offset).r;
    float g = texture2D(textureSampler, uv).g;
    float b = texture2D(textureSampler, uv - offset).b;
    
    gl_FragColor = vec4(r, g, b, 1.0);
}
