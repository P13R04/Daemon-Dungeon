// Film Grain - Security camera noise effect
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform float intensity;

// Random noise function
float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + time) * 43758.5453);
}

void main(void) {
    vec4 color = texture2D(textureSampler, vUV);
    
    // Generate noise
    float noise = random(vUV) * 2.0 - 1.0;
    
    // Apply grain
    color.rgb += noise * intensity;
    
    gl_FragColor = color;
}
