import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Check, Hammer, Truck, ShieldCheck, Lock, Clock, Camera, ArrowLeft, Upload } from 'lucide-react';
import { useEscrow } from '../context/EscrowContext';

interface MilestoneTrackerProps {
  onBack?: () => void;
  isArtisanView?: boolean;
}

export const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ onBack, isArtisanView = false }) => {
  const { order, submitMilestoneProof, approveMilestone } = useEscrow();

  const [uploadingMilestoneId, setUploadingMilestoneId] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState('');

  const renderIcon = (stageNumber: number) => {
    switch (stageNumber) {
      case 1:
        return <Camera className="w-3.5 h-3.5" />;
      case 2:
        return <Hammer className="w-3.5 h-3.5" />;
      case 3:
        return <Truck className="w-3.5 h-3.5" />;
      default:
        return <Check className="w-3.5 h-3.5" />;
    }
  };

  const handleApprove = (milestoneId: string) => {
    approveMilestone(milestoneId);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#EA580C', '#15803D', '#EAB308']
    });
  };

  const handleSubmitProof = (milestoneId: string) => {
    if (!photoUrlInput) return;
    submitMilestoneProof(milestoneId, [photoUrlInput]);
    setUploadingMilestoneId(null);
    setPhotoUrlInput('');
  };

  const totalReleased = order.totalBudget - order.escrowVaultBalance;

  return (
    <div className="w-full space-y-4 pb-20 font-sans">
      
      {/* Back Button Navigation Header */}
      {onBack && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1A120E] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#2A1E17] text-xs font-bold transition-all shadow"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Back</span>
          </button>
        </div>
      )}
      
      {/* 1. Order Header Card */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 shadow-lg space-y-3">
        {/* Top Meta: Order ID & Escrow Status */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EA580C]/10 border border-[#EA580C]/30 text-[#EA580C] text-[10px] font-mono font-bold">
            <span>Order #{order.orderId}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAB308]/10 border border-[#EAB308]/30 text-[#EAB308] text-[10px] font-semibold">
            <Lock className="w-3 h-3 text-[#EAB308]" />
            <span>Escrow Vault Locked</span>
          </span>
        </div>

        {/* Product Title & Parties */}
        <div>
          <h1 className="text-base font-bold text-white tracking-tight leading-snug">
            {order.productTitle}
          </h1>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
            <span>Buyer: <strong className="text-slate-200">{order.buyerName}</strong></span>
            <span>•</span>
            <span>Artisan: <strong className="text-[#EA580C]">{order.artisanName}</strong></span>
          </div>
        </div>

        {/* Total Project Value & Financial Summary Banner */}
        <div className="bg-[#120B08] border border-[#2A1E17] rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Total Budget
            </span>
            <span className="text-lg font-mono font-bold text-[#EAB308] block">
              ₹{order.totalBudget.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              100% Protected
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              ₹{order.escrowVaultBalance.toLocaleString('en-IN')} In Vault
            </span>
          </div>
        </div>
      </div>

      {/* 2. Vertical Visual Progress Timeline */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-4 shadow-lg">
        <div>
          <h2 className="text-sm font-bold text-white">Live Milestone Timeline</h2>
          <p className="text-[10px] text-slate-400">Funds released progressively upon proof approval.</p>
        </div>

        <div className="relative pl-6 space-y-5 border-l-2 border-[#2A1E17] ml-2">
          {order.milestones.map((step) => {
            const isInProgress = step.status === 'IN_PROGRESS';
            const isProofSubmitted = step.status === 'PROOF_SUBMITTED';
            const isApproved = step.status === 'APPROVED_AND_PAID';

            return (
              <div key={step.id} className="relative">
                
                {/* Timeline Node Icon */}
                <div
                  className={`absolute -left-[33px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    isApproved ? 'bg-emerald-600 text-white shadow'
                      : isInProgress ? 'bg-[#EA580C] text-white shadow animate-pulse'
                      : isProofSubmitted ? 'bg-[#EAB308] text-[#120B08] shadow'
                      : 'bg-[#120B08] text-slate-500 border border-[#2A1E17]'
                  }`}
                >
                  {isApproved ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : renderIcon(step.stageNumber)}
                </div>

                <div className={`border rounded-xl p-3.5 space-y-2.5 shadow-sm ${
                  isApproved ? 'bg-[#120B08] border-emerald-900/40' 
                  : isInProgress ? 'bg-[#160E0A] border-[#EA580C]/40'
                  : isProofSubmitted ? 'bg-[#16130A] border-[#EAB308]/40'
                  : 'bg-[#120B08] border-[#2A1E17] opacity-60'
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-[#2A1E17]/60 pb-2">
                    <div>
                      <span className="text-[9px] font-mono font-bold text-[#EA580C] uppercase block">
                        Stage {step.stageNumber} ({step.percentageSplit}%)
                      </span>
                      <h3 className="text-xs font-bold text-white">{step.title}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-white">
                        ₹{step.grossAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">{step.description}</p>

                  {/* STAGE 8 MATERIAL TRACEABILITY INJECTION */}
                  {step.title.includes('Material') && (
                    <div className="p-2 bg-emerald-950/30 border border-emerald-900/40 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-bold text-emerald-400 uppercase">Verification ID</p>
                        <p className="text-[11px] text-white font-mono">KAR-MAT-2026-97373</p>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-900/50 text-emerald-300 text-[9px] font-bold rounded">
                        Verified
                      </span>
                    </div>
                  )}

                  {/* ARTISAN VIEW CONTROLS */}
                  {isArtisanView && isInProgress && (
                    <div className="pt-2 border-t border-[#2A1E17]/60">
                      {uploadingMilestoneId === step.id ? (
                        <div className="space-y-2">
                          <input 
                            type="url" 
                            placeholder="Paste photo URL here..." 
                            value={photoUrlInput}
                            onChange={(e) => setPhotoUrlInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                          />
                          <div className="flex space-x-2">
                            <button onClick={() => setUploadingMilestoneId(null)} className="flex-1 py-1.5 rounded-lg border border-[#2A1E17] text-slate-400 text-xs font-bold">Cancel</button>
                            <button onClick={() => handleSubmitProof(step.id)} className="flex-1 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold">Submit</button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setUploadingMilestoneId(step.id)}
                          className="w-full py-2 rounded-xl bg-[#261B15] text-white text-xs font-bold border border-[#3E2E24] flex items-center justify-center space-x-1.5"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#EA580C]" />
                          <span>Upload Progress Proof</span>
                        </button>
                      )}
                    </div>
                  )}

                  {isArtisanView && isProofSubmitted && (
                    <div className="pt-2 border-t border-[#2A1E17]/60">
                       <span className="text-xs font-bold text-[#EAB308] flex items-center">
                         <Clock className="w-3.5 h-3.5 mr-1" /> Pending Buyer Approval...
                       </span>
                    </div>
                  )}

                  {/* BUYER VIEW CONTROLS */}
                  {!isArtisanView && (isInProgress || isProofSubmitted) && (
                    <div className="pt-2 border-t border-[#2A1E17]/60 space-y-2">
                      {isProofSubmitted && (
                        <div className="bg-[#120B08] p-2 rounded-lg border border-[#EAB308]/30">
                          <p className="text-[10px] font-bold text-[#EAB308] uppercase mb-1">Artisan Proof</p>
                          {step.proofImages.map((img, idx) => (
                            <img key={idx} src={img} alt="Proof" className="w-full h-32 object-cover rounded border border-[#2A1E17]" />
                          ))}
                        </div>
                      )}
                      <button 
                        onClick={() => handleApprove(step.id)}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all flex items-center justify-center space-x-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Approve & Release (₹{step.grossAmount.toLocaleString('en-IN')})</span>
                      </button>
                    </div>
                  )}

                  {/* SHARED: APPROVED STATE */}
                  {isApproved && (
                    <div className="pt-2 border-t border-[#2A1E17]/60 flex items-center justify-between">
                       <span className="text-[11px] font-bold text-emerald-400 flex items-center">
                         <Check className="w-3.5 h-3.5 mr-1" /> Stage Approved & Released
                       </span>
                       <span className="text-[9px] text-slate-500 font-mono">{step.approvedAt}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Escrow Summary Card */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center space-x-1.5 text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Escrow Summary</h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-[#120B08] border border-emerald-950">
            <span className="text-[10px] text-slate-400 block">Remaining in Vault</span>
            <p className="text-base font-mono font-bold text-emerald-400 mt-0.5">
              ₹{order.escrowVaultBalance.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-[#120B08] border border-[#2A1E17]">
            <span className="text-[10px] text-slate-400 block">Released Payout</span>
            <p className="text-base font-mono font-bold text-white mt-0.5">
              ₹{totalReleased.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
