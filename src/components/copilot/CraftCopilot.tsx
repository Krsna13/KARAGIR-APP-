import React, { useState } from 'react';
import { Sparkles, Send, Edit, Play } from 'lucide-react';
import { LocalAIStatus } from './LocalAIStatus';
import { VoiceInput } from './VoiceInput';
import { ReferenceImageInput } from './ReferenceImageInput';
import { getCraftAIProvider } from '../../services/craftAIProvider';
import { getOfficeKitProvider } from '../../services/officeKitProvider';
import { validateCraftSpecification, type ValidationResult } from '../../services/craftSpecificationValidator';
import type { CraftSpecification, MultimodalCraftRequest } from '../../types/copilot';

interface CraftCopilotProps {
  onApplySpecification: (spec: CraftSpecification) => void;
}

export const CraftCopilot: React.FC<CraftCopilotProps> = ({ onApplySpecification }) => {
  const [textInput, setTextInput] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [specification, setSpecification] = useState<CraftSpecification | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDebugScreenOpen, setIsDebugScreenOpen] = useState(false);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  const handleUnderstandRequest = async () => {
    if (!textInput && !voiceTranscript && !referenceImage) {
      setValidation({ isValid: false, errors: ["Please provide text, voice, or an image requirement."] });
      return;
    }

    setIsProcessing(true);
    setValidation(null);
    setSpecification(null);
    setIsEditing(false);

    try {
      const provider = getCraftAIProvider();
      const request: MultimodalCraftRequest = {
        text: textInput || null,
        voiceTranscript: voiceTranscript,
        referenceImage: referenceImage
      };

      const result = await provider.analyzeRequest(request);
      setSpecification(result);
      setValidation(validateCraftSpecification(result));
    } catch (e) {
      setValidation({ isValid: false, errors: ["Failed to process AI request."] });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (specification) {
      const currentValidation = validateCraftSpecification(specification);
      setValidation(currentValidation);
      if (currentValidation.isValid) {
         onApplySpecification(specification);
      }
    }
  };

  const handleSendToLaptop = async () => {
    if (specification) {
      const currentValidation = validateCraftSpecification(specification);
      setValidation(currentValidation);
      if (currentValidation.isValid) {
        setHandoffStatus("Sending...");
        const provider = getOfficeKitProvider();
        
        if (!provider.isAvailable()) {
          setHandoffStatus("Office Kit unavailable on this device.");
          return;
        }

        const pkg = provider.createHandoff({
          source: "mobile_copilot",
          customerId: "customer-123", // In a real app, this comes from auth context
          craftSpecification: specification,
          referenceImage: {
            available: !!referenceImage,
            localUri: referenceImage
          },
          voiceTranscript: voiceTranscript,
          artisanBrief: null,
          estimatedPrice: null
        });

        const success = await provider.sendHandoff(pkg);
        if (success) {
          setHandoffStatus("Sent! Open your laptop.");
        } else {
          setHandoffStatus("Failed to send.");
        }
      }
    }
  };

  const updateSpec = (field: keyof CraftSpecification, value: any) => {
    if (specification) {
      setSpecification({ ...specification, [field]: value });
    }
  };

  return (
    <div className="bg-[#120B08] p-5 rounded-2xl border border-[#EA580C]/40 shadow-inner space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2A1E17] pb-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-[#EA580C]" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Kaaragir Craft Copilot</h3>
        </div>
        <LocalAIStatus />
      </div>

      {/* Input Area */}
      {!specification && !isProcessing && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4">
             <VoiceInput onTranscriptChange={setVoiceTranscript} />
             <ReferenceImageInput onImageChange={setReferenceImage} />
          </div>
          
          <div className="space-y-2">
            <textarea
              className="w-full bg-[#1A120E] border border-[#2A1E17] focus:border-[#EA580C] rounded-xl p-3 text-xs text-white placeholder-slate-500 min-h-[100px] outline-none transition-all"
              placeholder="Describe your product, material, size, style, finish, or special requirements..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            
            {validation && !validation.isValid && (
              <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-lg">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400 font-bold">{err}</p>
                ))}
              </div>
            )}

            <button
              onClick={handleUnderstandRequest}
              className="w-full py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-md glow-orange flex items-center justify-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Understand My Requirement</span>
            </button>
          </div>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="p-8 flex flex-col items-center justify-center space-y-4 border border-[#2A1E17] rounded-xl bg-[#1A120E]">
          <div className="relative flex h-8 w-8">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EA580C] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-8 w-8 bg-[#EA580C]"></span>
          </div>
          <p className="text-xs font-bold text-[#EA580C] animate-pulse uppercase tracking-widest">Understanding requirement...</p>
          <div className="text-[10px] text-slate-400 space-y-1 font-mono">
            <p>✓ Input received</p>
            <p className="text-white">● Extracting specifications</p>
            <p>● Preparing 3D configuration</p>
          </div>
        </div>
      )}

      {/* AI Result Card */}
      {specification && !isProcessing && (
        <div className="space-y-4">
          <div className="bg-[#1A120E] border border-emerald-900/50 rounded-xl p-4 shadow-lg relative overflow-hidden">
             {/* Decorative corner */}
             <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full border-l border-b border-emerald-500/20"></div>

             <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center">
               <Check className="w-3.5 h-3.5 mr-1.5" /> Understood Requirement
             </h4>

             {isEditing ? (
                <div className="space-y-3 text-xs">
                   <div className="flex flex-col gap-3">
                     <div>
                       <label className="text-slate-400 block mb-1">Product</label>
                       <input type="text" value={specification.product || ''} onChange={e => updateSpec('product', e.target.value)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Material</label>
                       <input type="text" value={specification.material || ''} onChange={e => updateSpec('material', e.target.value)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Length (ft)</label>
                       <input type="number" value={specification.length_ft || ''} onChange={e => updateSpec('length_ft', parseFloat(e.target.value) || null)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Width (ft)</label>
                       <input type="number" value={specification.width_ft || ''} onChange={e => updateSpec('width_ft', parseFloat(e.target.value) || null)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Height (ft)</label>
                       <input type="number" value={specification.height_ft || ''} onChange={e => updateSpec('height_ft', parseFloat(e.target.value) || null)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Seating</label>
                       <input type="number" value={specification.seating_capacity || ''} onChange={e => updateSpec('seating_capacity', parseInt(e.target.value, 10) || null)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Style</label>
                       <input type="text" value={specification.style || ''} onChange={e => updateSpec('style', e.target.value)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div>
                       <label className="text-slate-400 block mb-1">Finish</label>
                       <input type="text" value={specification.finish || ''} onChange={e => updateSpec('finish', e.target.value)} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                     <div className="col-span-2">
                       <label className="text-slate-400 block mb-1">Features (comma separated)</label>
                       <input type="text" value={specification.features.join(', ')} onChange={e => updateSpec('features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="w-full bg-[#120B08] border border-[#3E2E24] p-2 rounded text-white" />
                     </div>
                   </div>
                </div>
             ) : (
                <div className="flex flex-col gap-y-3 text-xs">
                   <div><span className="text-slate-500 block">Product</span><span className="text-white font-bold">{specification.product || <span className="text-slate-600 italic">Not specified</span>}</span></div>
                   <div><span className="text-slate-500 block">Material</span><span className="text-[#EAB308] font-bold">{specification.material || <span className="text-slate-600 italic">Not specified</span>}</span></div>
                   <div><span className="text-slate-500 block">Dimensions</span><span className="text-white font-mono">
                     {specification.length_ft || '?'} × {specification.width_ft || '?'} × {specification.height_ft || '?'} ft
                   </span></div>
                   <div><span className="text-slate-500 block">Seating</span><span className="text-white">{specification.seating_capacity || <span className="text-slate-600 italic">Not specified</span>}</span></div>
                   <div><span className="text-slate-500 block">Style</span><span className="text-white">{specification.style || <span className="text-slate-600 italic">Not specified</span>}</span></div>
                   <div><span className="text-slate-500 block">Finish</span><span className="text-white">{specification.finish || <span className="text-slate-600 italic">Not specified</span>}</span></div>
                   <div className="col-span-2"><span className="text-slate-500 block">Features</span><span className="text-white">{specification.features.join(', ') || <span className="text-slate-600 italic">None specified</span>}</span></div>
                </div>
             )}

             {validation && !validation.isValid && (
              <div className="mt-3 p-2 bg-red-950/40 border border-red-900/50 rounded-lg">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400 font-bold">{err}</p>
                ))}
              </div>
             )}
          </div>

           <div className="flex space-x-3">
             <button
               onClick={() => setIsEditing(!isEditing)}
               className="flex-1 py-2.5 rounded-xl border border-[#2A1E17] bg-[#1A120E] text-slate-300 text-xs font-bold flex items-center justify-center hover:bg-[#261B15] transition-all"
             >
               <Edit className="w-3.5 h-3.5 mr-1.5" /> {isEditing ? 'Done Editing' : 'Edit Specification'}
             </button>
             <button
               onClick={handleApply}
               className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md glow-green flex items-center justify-center transition-all"
             >
               <Play className="w-3.5 h-3.5 mr-1.5" /> Apply Here
             </button>
             <button
               onClick={handleSendToLaptop}
               className="flex-1 py-2.5 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-xs font-bold shadow-md flex items-center justify-center transition-all relative overflow-hidden"
             >
               <Send className="w-3.5 h-3.5 mr-1.5" /> Send to Laptop
             </button>
           </div>
           {handoffStatus && (
             <div className="text-center pt-2">
               <span className="text-[10px] text-[#0EA5E9] font-bold">{handoffStatus}</span>
             </div>
           )}
           <div className="text-center pt-2">
             <button onClick={() => setSpecification(null)} className="text-[10px] text-slate-500 hover:text-white underline">Start Over</button>
           </div>
        </div>
      )}

    </div>
  );
};

// simple missing Check icon wrapper for above component
function Check(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
}
