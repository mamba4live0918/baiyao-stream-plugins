// Loads every model, texture and font, reporting progress as items finish.
import { TextureLoader, SRGBColorSpace, NoColorSpace } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import stationUrl from '../assets/models/station.glb';
import starmapUrl from '../assets/textures/starmap.webp';
import earthDayUrl from '../assets/textures/earth_day.webp';
import earthNightUrl from '../assets/textures/earth_night.webp';
import earthCloudsUrl from '../assets/textures/earth_clouds.webp';
import explosion01Url from '../assets/textures/explosion01_5x5.webp';
import explosion02Url from '../assets/textures/explosion02_5x5.webp';
import titleFontUrl from '../assets/fonts/smiley-sans-subset.woff2';
import mono400Url from '../assets/fonts/space-mono-400.woff2';
import mono700Url from '../assets/fonts/space-mono-700.woff2';

export const FONT_FAMILIES = {
  title: 'BaiyaoTitle',
  mono: 'BaiyaoMono',
};

export async function loadAssets(onProgress) {
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new TextureLoader();

  const jobs = {
    station: () => gltfLoader.loadAsync(stationUrl),
    starmap: () => loadTexture(textureLoader, starmapUrl, SRGBColorSpace),
    earthDay: () => loadTexture(textureLoader, earthDayUrl, SRGBColorSpace),
    earthNight: () => loadTexture(textureLoader, earthNightUrl, SRGBColorSpace),
    earthClouds: () => loadTexture(textureLoader, earthCloudsUrl, NoColorSpace),
    explosion01: () => loadTexture(textureLoader, explosion01Url, SRGBColorSpace),
    explosion02: () => loadTexture(textureLoader, explosion02Url, SRGBColorSpace),
    fontTitle: () => loadFont(FONT_FAMILIES.title, titleFontUrl, '400'),
    fontMono: () => loadFont(FONT_FAMILIES.mono, mono400Url, '400'),
    fontMonoBold: () => loadFont(FONT_FAMILIES.mono, mono700Url, '700'),
  };

  const names = Object.keys(jobs);
  let done = 0;
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        const value = await jobs[name]();
        done++;
        onProgress(done / names.length);
        return value;
      } catch (err) {
        throw new Error(`${name} 加载失败（${err?.message || err}）`);
      }
    }),
  );
  return Object.fromEntries(names.map((name, i) => [name, results[i]]));
}

async function loadTexture(loader, url, colorSpace) {
  const texture = await loader.loadAsync(url);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 4;
  return texture;
}

async function loadFont(family, url, weight) {
  const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, style: 'normal' });
  await face.load();
  document.fonts.add(face);
  return face;
}
