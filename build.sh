#!/bin/bash
# Build script: Copy static files and minify JS

# Clean and create dist structure
rm -rf dist
mkdir -p dist/js/managers dist/js/models dist/js/services dist/assets

# Copy static files
cp index.html dist/
cp admin.html dist/
[ -f targets.mind ] && cp targets.mind dist/
[ -d assets ] && cp -r assets/* dist/assets/

# Minify each JS file individually (preserving folder structure)
for f in $(find js -name '*.js'); do
    npx terser "$f" -o "dist/$f" --compress --mangle --no-source-map
done

echo "Build complete! Files in dist/:"
ls -R dist/
