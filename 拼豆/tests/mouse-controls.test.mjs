import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToolSensitivity,validToolSensitivity,followBlend} from '../src/mouse-controls.js';
test('tool sensitivity uses safe defaults and strict imported limits',()=>{assert.equal(normalizeToolSensitivity(),1);assert.equal(normalizeToolSensitivity(0),.25);assert.equal(normalizeToolSensitivity(99),3);assert.equal(validToolSensitivity('1'),false);assert.equal(validToolSensitivity(1),true);});
test('low tool sensitivity follows more slowly and is frame-rate independent',()=>{assert.ok(followBlend(.02,.25)<followBlend(.02,1));assert.ok(followBlend(.02,1)<followBlend(.02,3));const one=1-followBlend(.1,1),many=(1-followBlend(.01,1))**10;assert.ok(Math.abs(one-many)<1e-12);});
