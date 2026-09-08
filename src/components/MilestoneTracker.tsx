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
        return <Camera className="w-4 h-4" />;
      case 2:
        return <Hammer className="w-4 h-4" />;
      case 3:
        return <Truck className="w-4 h-4" />;
      default:
        return <Check className="w-4 h-4" />;
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
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      
      {/* Back Button Navigation Header */}
      {onBack && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#1F1510] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#3E2E24] text-xs font-extrabold transition-all shadow-md group"
          >
            <ArrowLeft className="w-4 h-4 text-[#EA580C] group-hover:-translate-x-1 transition-transform" />
            <span>← Back to Home</span>
          </button>
        </div>
      )}
      
      {/* 1. Order Header */}
      <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3 mb-1.5">
            <span className="text-xs font-mono text-[#EA580C] bg-[#EA580C]/10 px-3 py-1 rounded-full border border-[#EA580C]/30 font-bold">
              Order ID: #{order.orderId}
            </span>
            <span className="text-xs font-semibold text-[#EAB308] bg-[#EAB308]/10 px-3 py-1 rounded-full border border-[#EAB308]/30 flex items-center">
              <Lock className="w-3 h-3 mr-1" />
              Locked in Escrow Vault
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{order.productTitle}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Buyer: <span className="text-white font-semibold">{order.buyerName}</span> • Artisan: <span className="text-white font-semibold">{order.artisanName}</span>
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-400 mb-1">Total Project Value</p>
          <p className="text-3xl font-extrabold text-[#EAB308] font-mono tracking-tight">₹{order.totalBudget.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Mobile Stack Layout: Timeline Top + Sidebar Bottom */}
      <div className="flex flex-col gap-8 w-full">
        
        {/* 3. Vertical Visual Progress Timeline */}
        <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Live Material Milestone Verification</h2>
            <p className="text-xs text-slate-400 mt-1">Funds are released progressively as workshop stages are verified.</p>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-10 border-l-2 border-[#2A1E17]">
            {order.milestones.map((step) => {
              const isInProgress = step.status === 'IN_PROGRESS';
              const isProofSubmitted = step.status === 'PROOF_SUBMITTED';
              const isApproved = step.status === 'APPROVED_AND_PAID';

              return (
                <div key={step.id} className="relative group">
                  
                  {/* Timeline Node Icon */}
                  <div
                    className={`absolute -left-[35px] sm:-left-[43px] top-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isApproved ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                        : isInProgress ? 'bg-[#EA580C] text-white shadow-lg glow-orange animate-pulse'
                        : isProofSubmitted ? 'bg-[#EAB308] text-[#120B08] shadow-lg glow-yellow'
                        : 'bg-[#120B08] text-slate-500 border border-[#2A1E17]'
                    }`}
                  >
                    {isApproved ? <Check className="w-5 h-5 stroke-[3]" /> : renderIcon(step.stageNumber)}
                  </div>

                  <div className={`border rounded-2xl p-5 space-y-4 shadow-md transition-colors ${
                    isApproved ? 'bg-[#120B08] border-emerald-900/40' 
                    : isInProgress ? 'bg-[#1a120e] border-[#EA580C]/40'
                    : isProofSubmitted ? 'bg-[#1a170e] border-[#EAB308]/40'
                    : 'bg-[#120B08] border-[#2A1E17] opacity-60'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#2A1E17]/60 pb-3">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#EA580C] tracking-widest uppercase block mb-1">
                          Stage {step.stageNumber} • {step.percentageSplit}% Tranche
                        </span>
                        <h3 className="text-sm font-bold text-white">{step.title}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono font-bold text-slate-400 block mb-1 uppercase tracking-widest">
                          Payout
                        </span>
                        <span className="text-sm font-extrabold text-white font-mono">
                          ₹{step.grossAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>

                    {/* STAGE 8 MATERIAL TRACEABILITY INJECTION */}
                    {step.title.includes('Material') && (
                      <div className="mt-4 p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Material Verification ID</p>
                          <p className="text-xs text-white font-mono">KAR-MAT-2026-97373</p>
                        </div>
                        <button className="px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-700/50 transition-colors">
                          Verify Material
                        </button>
                      </div>
                    )}

                    {/* ARTISAN VIEW CONTROLS */}
                    {isArtisanView && isInProgress && (
                      <div className="pt-3 border-t border-[#2A1E17]/60">
                        {uploadingMilestoneId === step.id ? (
                          <div className="space-y-3">
                            <input 
                              type="url" 
                              placeholder="Paste photo URL here..." 
                              value={photoUrlInput}
                              onChange={(e) => setPhotoUrlInput(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                            />
                            <div className="flex space-x-3">
                              <button onClick={() => setUploadingMilestoneId(null)} className="flex-1 py-2.5 rounded-xl border border-[#2A1E17] text-slate-400 text-xs font-bold hover:bg-[#261B15]">Cancel</button>
                              <button onClick={() => handleSubmitProof(step.id)} className="flex-1 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow-lg">Submit Proof</button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setUploadingMilestoneId(step.id)}
                            className="w-full py-2.5 rounded-xl bg-[#261B15] hover:bg-[#3E2E24] text-white text-xs font-bold border border-[#3E2E24] transition-all flex items-center justify-center space-x-2"
                          >
                            <Upload className="w-4 h-4 text-[#EA580C]" />
                            <span>Upload Progress Photo Proof</span>
                          </button>
                        )}
                      </div>
                    )}

                    {isArtisanView && isProofSubmitted && (
                      <div className="pt-2 border-t border-[#2A1E17]/60">
                         <span className="text-xs font-bold text-[#EAB308] flex items-center">
                           <Clock className="w-4 h-4 mr-1.5" /> Pending Buyer Approval...
                         </span>
                      </div>
                    )}

                    {/* BUYER VIEW CONTROLS */}
                    {!isArtisanView && (isInProgress || isProofSubmitted) && (
                      <div className="pt-3 border-t border-[#2A1E17]/60">
                        {isProofSubmitted && (
                          <div className="bg-[#120B08] p-3 rounded-xl border border-[#EAB308]/30 mb-4">
                            <p className="text-[11px] font-bold text-[#EAB308] uppercase tracking-wider mb-2">Artisan Submitted Proof</p>
                            {step.proofImages.map((img, idx) => (
                              <img key={idx} src={img} alt="Proof" className="w-full h-40 object-cover rounded-lg border border-[#2A1E17]" />
                            ))}
                            <p className="text-[10px] text-slate-400 font-mono mt-2 flex items-center">
                              <Clock className="w-3 h-3 mr-1" /> Submitted at {step.submittedAt}
                            </p>
                          </div>
                        )}
                        <button 
                          onClick={() => handleApprove(step.id)}
                          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center space-x-2 glow-green"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Pay & Done (₹{step.grossAmount.toLocaleString('en-IN')})</span>
                        </button>
                      </div>
                    )}

                    {/* SHARED: APPROVED STATE */}
                    {isApproved && (
                      <div className="pt-3 border-t border-[#2A1E17]/60 flex items-center justify-between">
                         <span className="text-xs font-bold text-emerald-400 flex items-center">
                           <Check className="w-4 h-4 mr-1.5" /> Stage Approved & Paid
                         </span>
                         <span className="text-[10px] text-slate-500 font-mono">{step.approvedAt}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Sidebar Detail Cards */}
        <div className="space-y-6">
          
          {/* Payment Escrow Protection Card */}
          <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-2 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">karagir Material Escrow</h3>
            </div>

            <div className="p-4 rounded-2xl bg-[#120B08] border border-emerald-950/80">
              <span className="text-xs text-slate-400">Remaining Payment</span>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-0.5">
                ₹{order.escrowVaultBalance.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#120B08] border border-[#2A1E17]">
              <span className="text-xs text-slate-400">Sent Payment</span>
              <p className="text-2xl font-extrabold text-white font-mono mt-0.5">
                ₹{totalReleased.toLocaleString('en-IN')}
              </p>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed pt-2">
              All payments are secured in the Karagir Escrow Vault and only released upon your explicit approval of physical milestone proofs.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
