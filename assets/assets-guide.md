# FoundryData - Logo Assets Usage Guide

## 📁 File Structure

```
foundrydata/
├── assets/
│   ├── logo.svg                 # Main logo (200x200)
│   ├── logo-monochrome.svg      # Single color version
│   ├── logo-square.svg          # With background for social
│   ├── wordmark.svg             # Logo + text (light mode)
│   ├── wordmark-dark.svg        # Logo + text (dark mode)
│   ├── favicon.svg              # Browser tab icon (32x32)
│   ├── og-image.svg             # Social media preview (1200x630)
│   └── banner.svg               # README header (1200x300)
├── README.md
└── ...
```

## 🎨 Asset Descriptions

| File | Size | Usage |
|------|------|-------|
| **logo.svg** | 200×200 | Main logo, GitHub org avatar, npm |
| **logo-monochrome.svg** | 200×200 | Single color contexts, printing |
| **logo-square.svg** | 200×200 | Twitter, LinkedIn profile pictures |
| **wordmark.svg** | 400×100 | README headers (light backgrounds) |
| **wordmark-dark.svg** | 400×100 | README headers (dark backgrounds) |
| **favicon.svg** | 32×32 | Browser tabs, bookmarks |
| **og-image.svg** | 1200×630 | Open Graph social previews |
| **banner.svg** | 1200×300 | Optional decorative README banner |

## 📝 README Integration Examples

### Basic Setup (Recommended)
```markdown
<div align="center">
  <img src="./assets/logo.svg" width="120" alt="FoundryData"/>
  
  # FoundryData
  
  **Generate test data from JSON Schema. 100% compliant or we tell you why.**
</div>
```

### With Dark Mode Support
```markdown
<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/wordmark.svg">
    <img src="./assets/wordmark.svg" width="350" alt="FoundryData">
  </picture>
</div>
```

### With Banner
```markdown
![FoundryData Banner](./assets/banner.svg)

# Welcome to FoundryData

[Rest of README...]
```

## 🌐 Platform-Specific Usage

### GitHub Organization
1. Go to Settings → Profile
2. Upload `logo.svg` as avatar (will be resized to 460×460)

### npm Package
```json
// package.json
{
  "name": "foundrydata",
  "logo": "https://raw.githubusercontent.com/foundrydata/foundrydata/main/assets/logo.svg"
}
```

### Website Favicon
```html
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
```

### Social Media Meta Tags
```html
<!-- Open Graph -->
<meta property="og:image" content="https://foundrydata.dev/assets/og-image.svg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://foundrydata.dev/assets/og-image.svg">
```

### Terminal/CLI
```javascript
// In your CLI tool
console.log(`
  { ▓▓ }  FoundryData v${version}
  { ▓▓ }  Test data from JSON Schema
`);
```

## 🎨 Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | `#3B82F6` | Main brand color, brackets |
| **Blue Light** | `#60A5FA` | Secondary blue |
| **Blue Lighter** | `#93C5FD` | Tertiary blue |
| **Success Green** | `#10B981` | Valid data, success states |
| **Green Light** | `#34D399` | Secondary green |
| **Green Lighter** | `#6EE7B7` | Tertiary green |
| **Dark** | `#0A0A0A` | Text on light backgrounds |
| **White** | `#FFFFFF` | Text on dark backgrounds |

## 💡 Best Practices

1. **Always use SVG** when possible (scales perfectly)
2. **Include alt text** for accessibility
3. **Use relative paths** in README (`./assets/` not absolute URLs)
4. **Optimize file sizes** before committing (use SVGO if needed)
5. **Test in both** light and dark GitHub themes
6. **Keep consistent** sizing across similar contexts


## 📄 License

All logo assets are part of the FoundryData project and covered under the MIT License.