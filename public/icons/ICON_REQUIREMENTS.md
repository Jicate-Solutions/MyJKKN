# PWA Icon Requirements for MyJKKN

## Required Icons

All icons should be created from the existing logo.jpg in the public folder and optimized for PWA use.

### Standard App Icons

- `icon-16x16.png` - Favicon (16×16px)
- `icon-32x32.png` - Favicon (32×32px)
- `icon-72x72.png` - Android (72×72px)
- `icon-96x96.png` - Android (96×96px)
- `icon-128x128.png` - Android (128×128px)
- `icon-152x152.png` - iOS (152×152px)
- `icon-180x180.png` - Apple Touch Icon (180×180px)
- `icon-192x192.png` - PWA Standard (192×192px)
- `icon-384x384.png` - Android (384×384px)
- `icon-512x512.png` - PWA Standard (512×512px)

### Apple Touch Icons

- `apple-touch-icon.png` - Main Apple Touch Icon (180×180px)

### Apple Splash Screens (Portrait)

- `apple-splash-750x1334.png` - iPhone 6/7/8 (750×1334px)
- `apple-splash-828x1792.png` - iPhone XR (828×1792px)
- `apple-splash-1125x2436.png` - iPhone X/XS (1125×2436px)
- `apple-splash-1170x2532.png` - iPhone 12/13 Pro (1170×2532px)
- `apple-splash-1284x2778.png` - iPhone 12/13 Pro Max (1284×2778px)
- `apple-splash-1536x2048.png` - iPad (1536×2048px)
- `apple-splash-1668x2388.png` - iPad Pro 11" (1668×2388px)
- `apple-splash-2048x2732.png` - iPad Pro 12.9" (2048×2732px)

### Microsoft Tiles

- `mstile-70x70.png` - Small Tile (70×70px)
- `mstile-150x150.png` - Medium Tile (150×150px)
- `mstile-310x150.png` - Wide Tile (310×150px)
- `mstile-310x310.png` - Large Tile (310×310px)

### Safari Pinned Tab

- `safari-pinned-tab.svg` - Safari Pinned Tab (Vector SVG)

### Shortcut Icons

- `shortcut-dashboard.png` - Dashboard shortcut (192×192px)
- `shortcut-admissions.png` - Admissions shortcut (192×192px)
- `shortcut-students.png` - Students shortcut (192×192px)
- `shortcut-billing.png` - Billing shortcut (192×192px)

### Screenshots for App Stores

- `../screenshots/desktop-dashboard.png` - Desktop view (1280×720px)
- `../screenshots/mobile-dashboard.png` - Mobile view (390×844px)

## Design Guidelines

1. **Base Image**: Use `/public/logo.jpg` as the source
2. **Background**: Use white background for better contrast
3. **Padding**: Add 10% padding around the logo for better appearance
4. **Format**: Use PNG for all icons except Safari pinned tab (SVG)
5. **Optimization**: Optimize all images for web (reduce file size)

## Maskable Icons

All icons should support "maskable" purpose for Android adaptive icons:

- Ensure the important content is within the safe area (center 80%)
- Use solid background color
- Test with different mask shapes (circle, rounded square, etc.)

## Tools for Icon Generation

### Recommended Tools:

1. **PWA Builder** (https://www.pwabuilder.com/imageGenerator)
2. **App Icon Generator** (https://appicon.co/)
3. **Real Favicon Generator** (https://realfavicongenerator.net/)
4. **PWA Asset Generator** (VS Code extension)

### Manual Creation:

1. Use design tools like Figma, Photoshop, or GIMP
2. Start with 512x512 master icon
3. Scale down for smaller sizes
4. Ensure readability at smallest sizes

## Testing

After creating icons, test with:

1. Chrome DevTools > Application > Manifest
2. Lighthouse PWA audit
3. Test installation on mobile devices
4. Verify icons appear correctly in all contexts

## Current Status

❌ All icon files need to be created
✅ Directory structure created
✅ Manifest references configured
✅ Metadata configured in layout
