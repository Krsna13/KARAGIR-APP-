import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Product } from '../types';
import { RotateCw, Sparkles, Check, Eye, Wand2 } from 'lucide-react';

import { useMaterial } from '../context/MaterialContext';
import { BASE_MATERIAL_PRICE_DELTAS } from '../data/materialsMasterDatabase';
import { parseDesignDescriptionWithAI } from '../services/aiCraftService';

interface ThreeDProductViewerProps {
  product: Product;
  onClose: () => void;
}

export const ThreeDProductViewer: React.FC<ThreeDProductViewerProps> = ({ product, onClose }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedFinish, setSelectedFinish] = useState<string>(product.finishOptions[0] || 'Natural Teak Wax');
  const [activeHotspot, setActiveHotspot] = useState<string | null>('joinery');
  const sceneRef = useRef<THREE.Scene | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // AI Prompt State inside 3D Inspector Modal
  const [aiPrompt, setAiPrompt] = useState<string>('add 2 front drawers with brass knobs');
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [hasDrawers, setHasDrawers] = useState<boolean>(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);

  const { selectedPrimaryMaterial, calculateAdjustedPrice, selectedAccentMaterials } = useMaterial();
  const hasPrice = product.price != null && product.price > 0;
  const adjustedPrice = hasPrice ? calculateAdjustedPrice(product.price) : null;

  // Lock background scroll when modal opens
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // Dimensions
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x120b08);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 5);
    camera.lookAt(0, 0, 0);

    // WebGL Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountRef.current.appendChild(renderer.domElement);

    // Bright Warm Studio Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xfff8f0, 1.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xfff0dd, 2.2);
    mainLight.position.set(6, 8, 6);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xe0ecff, 1.2);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffe4cc, 1.4);
    rimLight.position.set(0, 5, -8);
    scene.add(rimLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(10, 20, 0xea580c, 0x2a1e17);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);

    // Wood / Material setup from selectedPrimaryMaterial
    const matMeta = BASE_MATERIAL_PRICE_DELTAS[selectedPrimaryMaterial] || BASE_MATERIAL_PRICE_DELTAS['Sagwan (Teak Wood)'];

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: matMeta.colorHex || '#9C562B',
      roughness: matMeta.roughness || 0.4,
      metalness: matMeta.metalness || 0.1,
    });
    materialRef.current = woodMaterial;

    const upholsteryMaterial = new THREE.MeshStandardMaterial({
      color: selectedPrimaryMaterial.toLowerCase().includes('leather') ? '#7c3f1d' : (selectedPrimaryMaterial.toLowerCase().includes('velvet') ? '#1b4d3e' : '#d9c5b2'),
      roughness: 0.6,
      metalness: 0.05,
    });

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: '#d4af37',
      roughness: 0.15,
      metalness: 0.92,
    });

    const group = new THREE.Group();

    // Build procedural 3D model according to product type
    const mType = product.model3DType;
    if (mType === 'sofa') {
      const seatGeo = new THREE.BoxGeometry(2.4, 0.3, 1.4);
      const seatMesh = new THREE.Mesh(seatGeo, woodMaterial);
      seatMesh.position.y = -0.3;
      group.add(seatMesh);

      const cushionGeo = new THREE.BoxGeometry(2.3, 0.25, 1.3);
      const cushionMesh = new THREE.Mesh(cushionGeo, upholsteryMaterial);
      cushionMesh.position.y = -0.05;
      cushionMesh.castShadow = true;
      group.add(cushionMesh);

      const backGeo = new THREE.BoxGeometry(2.4, 1.1, 0.3);
      const backMesh = new THREE.Mesh(backGeo, upholsteryMaterial);
      backMesh.position.set(0, 0.5, -0.55);
      backMesh.castShadow = true;
      group.add(backMesh);

      const armGeo = new THREE.BoxGeometry(0.3, 0.7, 1.4);
      const arm1 = new THREE.Mesh(armGeo, upholsteryMaterial);
      arm1.position.set(-1.25, 0.15, 0);
      const arm2 = new THREE.Mesh(armGeo, upholsteryMaterial);
      arm2.position.set(1.25, 0.15, 0);
      group.add(arm1, arm2);

      const legGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.3, 12);
      [[-1.1, -0.6, -0.55], [1.1, -0.6, -0.55], [-1.1, -0.6, 0.55], [1.1, -0.6, 0.55]].forEach(pos => {
        const leg = new THREE.Mesh(legGeo, accentMaterial);
        leg.position.set(pos[0], pos[1], pos[2]);
        group.add(leg);
      });

    } else if (mType === 'bed') {
      const platformGeo = new THREE.BoxGeometry(2.6, 0.35, 2.4);
      const platformMesh = new THREE.Mesh(platformGeo, woodMaterial);
      platformMesh.position.y = -0.4;
      group.add(platformMesh);

      const matMat = new THREE.MeshStandardMaterial({ color: 0xf5f0eb, roughness: 0.8 });
      const mattressGeo = new THREE.BoxGeometry(2.45, 0.35, 2.25);
      const mattressMesh = new THREE.Mesh(mattressGeo, matMat);
      mattressMesh.position.y = -0.05;
      group.add(mattressMesh);

      const headGeo = new THREE.BoxGeometry(2.7, 1.6, 0.25);
      const headMesh = new THREE.Mesh(headGeo, woodMaterial);
      headMesh.position.set(0, 0.55, -1.2);
      group.add(headMesh);

    } else if (mType === 'door') {
      const jambGeo = new THREE.BoxGeometry(2.2, 3.0, 0.15);
      const jambMesh = new THREE.Mesh(jambGeo, woodMaterial);
      jambMesh.position.y = 0.2;
      group.add(jambMesh);

      const locksetMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
      const lockset = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.18), locksetMat);
      lockset.position.set(0.75, 0.1, 0.15);
      group.add(lockset);

    } else if (mType === 'home_temple' || mType === 'carved_mandir') {
      const baseGeo = new THREE.BoxGeometry(2.2, 0.3, 1.4);
      const base = new THREE.Mesh(baseGeo, woodMaterial);
      base.position.y = -0.6;
      group.add(base);

      const roofGeo = new THREE.ConeGeometry(1.2, 0.8, 4);
      const roof = new THREE.Mesh(roofGeo, woodMaterial);
      roof.position.y = 1.1;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);

      const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 12);
      [[-0.9, 0.2, 0.5], [0.9, 0.2, 0.5], [-0.9, 0.2, -0.5], [0.9, 0.2, -0.5]].forEach(pos => {
        const p = new THREE.Mesh(pillarGeo, woodMaterial);
        p.position.set(pos[0], pos[1], pos[2]);
        group.add(p);
      });

    } else if (mType === 'indoor_swing' || mType === 'sheesham_jhula') {
      const beamGeo = new THREE.BoxGeometry(2.6, 0.15, 0.15);
      const topBeam = new THREE.Mesh(beamGeo, woodMaterial);
      topBeam.position.y = 1.4;
      group.add(topBeam);

      const seatGeo = new THREE.BoxGeometry(1.8, 0.15, 0.9);
      const seatMesh = new THREE.Mesh(seatGeo, woodMaterial);
      seatMesh.position.y = -0.2;
      group.add(seatMesh);

      const chainGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8);
      const cMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
      [[-0.8, 0.6, 0], [0.8, 0.6, 0]].forEach(pos => {
        const c = new THREE.Mesh(chainGeo, cMat);
        c.position.set(pos[0], pos[1], pos[2]);
        group.add(c);
      });

    } else {
      // Tabletop
      const topGeo = new THREE.BoxGeometry(3.2, 0.15, 1.8);
      const topMesh = new THREE.Mesh(topGeo, woodMaterial);
      topMesh.position.y = 0.5;
      topMesh.castShadow = true;
      topMesh.receiveShadow = true;
      group.add(topMesh);

      // Apron
      const apronGeo = new THREE.BoxGeometry(3.0, 0.14, 1.6);
      const apronMesh = new THREE.Mesh(apronGeo, woodMaterial);
      apronMesh.position.y = 0.35;
      group.add(apronMesh);

      // 🗄️ DYNAMIC 3D DRAWERS PROCEDURAL MESH
      if (hasDrawers) {
        const drawerGeo = new THREE.BoxGeometry(1.2, 0.25, 1.45);
        const drawerMat = new THREE.MeshStandardMaterial({
          color: woodMaterial.color.clone().multiplyScalar(0.9),
          roughness: woodMaterial.roughness,
          metalness: woodMaterial.metalness
        });

        const d1 = new THREE.Mesh(drawerGeo, drawerMat);
        d1.position.set(-0.7, 0.22, 0.05);
        d1.castShadow = true;
        group.add(d1);

        const d2 = new THREE.Mesh(drawerGeo, drawerMat);
        d2.position.set(0.7, 0.22, 0.05);
        d2.castShadow = true;
        group.add(d2);

        // Brass Pull Knobs
        const knobGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const knobMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
        const k1 = new THREE.Mesh(knobGeo, knobMat);
        k1.position.set(-0.7, 0.22, 0.78);
        const k2 = new THREE.Mesh(knobGeo, knobMat);
        k2.position.set(0.7, 0.22, 0.78);
        group.add(k1, k2);
      }

      // 4 Mortise & Tenon Legs
      const legGeo = new THREE.CylinderGeometry(0.08, 0.06, 1.7, 16);
      const legPositions = [
        [-1.4, -0.35, -0.7],
        [1.4, -0.35, -0.7],
        [-1.4, -0.35, 0.7],
        [1.4, -0.35, 0.7],
      ];
      legPositions.forEach((pos) => {
        const leg = new THREE.Mesh(legGeo, woodMaterial);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.castShadow = true;
        group.add(leg);
      });
    }

    scene.add(group);

    // Mouse Interaction
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      group.rotation.y += deltaX * 0.01;
      group.rotation.x += deltaY * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const domElement = mountRef.current;
    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isDragging) {
        group.rotation.y += 0.004;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [product, selectedPrimaryMaterial, selectedAccentMaterials, hasDrawers]);

  // AI Prompt Execution Handler inside 3D Modal
  const handleApplyAiPrompt = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiProcessing(true);
    setAiStatusMessage(null);

    const spec = await parseDesignDescriptionWithAI(aiPrompt);

    if (materialRef.current) {
      materialRef.current.color.set(spec.colorHex || '#8B4513');
      materialRef.current.roughness = spec.roughness ?? 0.4;
      materialRef.current.metalness = spec.metalness ?? 0.1;
      materialRef.current.needsUpdate = true;
    }

    if (spec.finishName) {
      setSelectedFinish(spec.finishName);
    }

    if (spec.hasDrawers !== undefined) {
      setHasDrawers(spec.hasDrawers);
    }

    setIsAiProcessing(false);
    setAiStatusMessage(spec.explanationNotes);
  };

  return (
    <div className="fixed inset-0 z-[20000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-[#120B08] border border-[#3E2E24] rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row min-h-[600px] my-auto">
        
        {/* Left: 3D Viewport Canvas */}
        <div className="relative flex-1 bg-[#120B08] min-h-[400px] lg:min-h-[600px] flex items-center justify-center">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Top Floating Badge */}
          <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-[#1F1510]/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#2A1E17]">
            <Eye className="w-3.5 h-3.5 text-[#EA580C]" />
            <span className="text-xs font-bold text-slate-200">360° {product.title} 3D Inspector</span>
          </div>

          {/* Interactive Hotspots Trigger Bar */}
          <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
            {hasDrawers && (
              <span className="bg-[#EA580C] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow glow-orange">
                + 3D Drawers Added
              </span>
            )}
            <button
              onClick={() => setActiveHotspot(activeHotspot === 'joinery' ? null : 'joinery')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeHotspot === 'joinery'
                  ? 'bg-[#EA580C] text-white shadow-lg glow-orange'
                  : 'bg-[#1F1510]/90 text-slate-300 border border-[#2A1E17]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Inspect Wood Joinery</span>
            </button>
          </div>

          {/* Bottom Orbit Indicator */}
          <div className="absolute bottom-4 left-4 z-10 bg-[#1F1510]/80 backdrop-blur-md px-3 py-1 rounded-xl border border-[#2A1E17] text-[11px] font-mono text-slate-400">
            <RotateCw className="w-3 h-3 inline mr-1.5 text-[#EA580C]" />
            Click & Drag to Rotate | Scroll to Zoom
          </div>
        </div>

        {/* Right: Product Details, AI Prompt Editor & Finish Controls Panel */}
        <div className="w-full lg:w-[420px] p-6 bg-[#1F1510] border-t lg:border-t-0 lg:border-l border-[#2A1E17] flex flex-col justify-between overflow-y-auto custom-scrollbar">
          <div>
            {/* Header Close */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
                  {product.category} • {product.shopName}
                </span>
                <h3 className="text-lg font-bold text-white leading-snug mt-1">{product.title}</h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#2A1E17] hover:bg-[#3E2E24] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Price Tag with Material Adjustment */}
            <div className="mb-5 p-3.5 rounded-2xl bg-[#120B08] border border-[#2A1E17] flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Material-Adjusted Price</span>
                {adjustedPrice != null ? (
                  <p className="text-xl font-extrabold text-[#EAB308] font-mono">₹{adjustedPrice.toLocaleString('en-IN')}</p>
                ) : (
                  <p className="text-xs font-bold text-amber-500/90 pt-1">Price not set / कीमत तय नहीं</p>
                )}
              </div>
              {hasPrice && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800">
                  Grade-A Verified
                </span>
              )}
            </div>

            {/* ✨ AI 3D GENERATIVE TEXT PROMPT EDITOR IN MODAL */}
            <div className="mb-5 p-4 rounded-2xl bg-[#120B08] border border-[#EA580C]/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Wand2 className="w-4 h-4 text-[#EA580C]" />
                  <span className="text-xs font-extrabold text-white uppercase tracking-wider">AI 3D Text Editor</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  Smart AI Engine Active
                </span>
              </div>

              <textarea
                rows={2}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Type design changes to update 3D model (e.g. Add 2 drawers, Change wood to brass)..."
                className="w-full bg-[#1F1510] border border-[#3E2E24] p-2.5 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-[#EA580C] resize-none"
              ></textarea>

              <button
                type="button"
                onClick={handleApplyAiPrompt}
                disabled={isAiProcessing}
                className="w-full py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-md glow-orange flex items-center justify-center space-x-2"
              >
                <Wand2 className={`w-3.5 h-3.5 ${isAiProcessing ? 'animate-spin' : ''}`} />
                <span>{isAiProcessing ? 'Updating 3D Model...' : '✨ Apply AI Text to 3D Model'}</span>
              </button>

              {aiStatusMessage && (
                <div className="p-2 rounded-lg bg-[#1F1510] border border-emerald-800 text-[10px] text-emerald-400 font-mono">
                  {aiStatusMessage}
                </div>
              )}
            </div>

            {/* Selected Material Composition Summary */}
            <div className="mb-5 p-3.5 rounded-2xl bg-[#261B15] border border-[#EA580C]/40 space-y-1">
              <span className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">Active Texture Shader</span>
              <p className="text-xs font-semibold text-white">{selectedPrimaryMaterial}</p>
              <p className="text-[11px] text-slate-300">
                Inlays: {selectedAccentMaterials.length > 0 ? selectedAccentMaterials.join(', ') : 'None'}
              </p>
            </div>

            {/* Finish Options Selector */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Select Organic Finish Polish:
              </label>
              <div className="space-y-1.5">
                {product.finishOptions.map((finish) => (
                  <button
                    key={finish}
                    onClick={() => setSelectedFinish(finish)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      selectedFinish === finish
                        ? 'bg-[#EA580C]/20 border border-[#EA580C] text-white font-semibold'
                        : 'bg-[#120B08] border border-[#2A1E17] text-slate-400 hover:border-[#3E2E24]'
                    }`}
                  >
                    <span>{finish}</span>
                    {selectedFinish === finish && <Check className="w-4 h-4 text-[#EA580C]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2 pt-3 border-t border-[#2A1E17]">
            <button className="w-full py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-lg glow-orange flex items-center justify-center space-x-2">
              <span>Lock Material Order & Lock Escrow</span>
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-400 hover:text-white text-xs font-semibold transition-all border border-[#2A1E17]"
            >
              Close 3D View
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
