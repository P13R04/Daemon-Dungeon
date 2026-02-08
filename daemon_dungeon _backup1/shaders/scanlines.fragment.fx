// CRT Scanlines effect
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float screenHeight;

void main(void) {
    vec4 color = texture2D(textureSampler, vUV);
    
    // Create scanlines (darker horizontal lines)
    float scanline = sin(vUV.y * screenHeight * 2.0) * 0.05 + 0.95;
    color.rgb *= scanline;
    
    gl_FragColor = color;
}
