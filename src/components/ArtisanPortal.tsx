import React, { useState, useEffect } from 'react';
import { MOCK_RADAR_REQUESTS } from '../data/mockData';
import type { IncomingRequestRadar } from '../types';
import { Radar, Upload, Check, Send, FolderKanban, MessageSquare, Wallet, Settings, Hammer, Sparkles, X, ArrowLeft } from 'lucide-react';
import { KaragirProfileCard } from './KaragirProfileCard';
import { useKaragirStore } from '../context/KaragirStoreContext';
import { useEscrow } from '../context/EscrowContext';
import { WorkshopProfileEditor } from './WorkshopProfileEditor';
import { CatalogEditor } from './CatalogEditor';
import { MilestoneTracker } from './MilestoneTracker';
import { WithdrawModal } from './WithdrawModal';

interface ArtisanPortalProps {
  onBackToBuyer?: () => void;
}

export const ArtisanPortal: React.FC<ArtisanPortalProps> = ({ onBackToBuyer }) => {
  const { storeData, saveStoreProfile, addWorkItem } = useKaragirStore();
  const { wallet } = useEscrow();
  
  const [activeSidebarTab, setActiveSidebarTab] = useState<'radar' | 'projects' | 'messages' | 'earnings' | 'profile' | 'catalog'>('radar');
  const [activeSubTab, setActiveSubTab] = useState<'Dashboard' | 'Directory' | 'Showcase'>('Dashboard');
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [hubTab, setHubTab] = useState<'radar' | 'enquiries'>('radar');
  const [quoteModalRequest, setQuoteModalRequest] = useState<IncomingRequestRadar | null>(null);
  const [quoteAmount, setQuoteAmount] = useState<number>(45000);
  const [timelineWeeks, setTimelineWeeks] = useState<number>(3);
  const [quoteNotes, setQuoteNotes] = useState<string>('Includes Grade-A Sagwan Teak wood seasoning certificate and 5-year anti-termite guarantee.');
  const [isQuoteSent, setIsQuoteSent] = useState<boolean>(false);
  const [isPhotoUploaded, setIsPhotoUploaded] = useState<boolean>(false);
  const [isSyncCompleted, setIsSyncCompleted] = useState<boolean>(false);

  // Lock background scroll when quote modal opens
  useEffect(() => {
    if (quoteModalRequest) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [quoteModalRequest]);

  const handleSendQuote = () => {
    setIsQuoteSent(true);
    setTimeout(() => {
      setIsQuoteSent(false);
      setQuoteModalRequest(null);
    }, 1800);
  };

  const handleSyncMilestone = () => {
    setIsSyncCompleted(true);
    setTimeout(() => {
      setIsSyncCompleted(false);
    }, 2000);
  };

  const navTabs = [
    { id: 'radar', label: 'Radar', icon: Radar },
    { id: 'projects', label: 'Projects (4)', icon: FolderKanban },
    { id: 'catalog', label: 'Catalog', icon: Hammer },
    { id: 'messages', label: 'Quotes', icon: MessageSquare },
    { id: 'earnings', label: 'Wallet', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: Settings },
  ] as const;

  return (
    <div className="w-full space-y-4 pb-20 font-sans">
      
      {/* 1. Mobile Artisan Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-bold text-white">Artisan Studio</span>
          <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse" />
        </div>

        {onBackToBuyer && (
          <button
            type="button"
            onClick={onBackToBuyer}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-[#1A120E] text-slate-300 hover:text-white border border-[#2A1E17] text-[11px] font-bold transition-all shadow"
          >
            <ArrowLeft className="w-3 h-3 text-[#EA580C]" />
            <span>Buyer Mode</span>
          </button>
        )}
      </div>

      {/* 2. Mobile Horizontal Navigation Tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSidebarTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                isActive
                  ? 'bg-[#EA580C] text-white shadow'
                  : 'bg-[#1A120E] text-slate-400 hover:text-white border border-[#2A1E17]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="w-full space-y-4">
        
        {/* Opportunity Hub & Live Sync Grid (Dashboard) */}
        {activeSidebarTab === 'radar' && activeSubTab === 'Dashboard' && (
          <div className="space-y-4">
            
            {/* 3. Sub-Header Tabs */}
            <div className="flex items-center space-x-1.5 bg-[#1A120E] p-1 rounded-xl border border-[#2A1E17]">
              {(['Dashboard', 'Directory', 'Showcase'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveSubTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === tab
                      ? 'bg-[#EA580C] text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Opportunity Radar Section */}
            <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3.5 shadow-lg">
              
              <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2.5">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <Radar className="w-4 h-4 text-[#EA580C]" />
                    <span>Area Request Radar</span>
                  </h2>
                  <p className="text-[10px] text-slate-400">Buyer orders within 5km radius</p>
                </div>

                <div className="flex items-center p-0.5 rounded-lg bg-[#120B08] border border-[#2A1E17]">
                  <button
                    onClick={() => setHubTab('radar')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      hubTab === 'radar' ? 'bg-[#EA580C] text-white' : 'text-slate-400'
                    }`}
                  >
                    Radar (4)
                  </button>
                  <button
                    onClick={() => setHubTab('enquiries')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      hubTab === 'enquiries' ? 'bg-[#EA580C] text-white' : 'text-slate-400'
                    }`}
                  >
                    Direct (2)
                  </button>
                </div>
              </div>

              {/* Incoming Order Request Cards */}
              <div className="space-y-3">
                {MOCK_RADAR_REQUESTS.map((req) => (
                  <div
                    key={req.id}
                    className="bg-[#120B08] border border-[#2A1E17] rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                          {req.postedAgo} • {req.locality} ({req.distanceKm} km)
                        </span>
                        <h3 className="text-xs font-bold text-white mt-1">{req.title}</h3>
                        <p className="text-[10px] text-slate-400">Buyer: {req.buyerName}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block">Est. Budget</span>
                        <span className="text-sm font-mono font-bold text-[#EAB308]">
                          ₹{req.budget.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-300 pt-1.5 border-t border-[#2A1E17]">
                      <span>{req.material}</span>
                      <span className="text-slate-400">Timeline: {req.timelineWeeks} wks</span>
                    </div>

                    <button
                      onClick={() => {
                        setQuoteModalRequest(req);
                        setQuoteAmount(req.budget);
                      }}
                      className="w-full py-2 rounded-lg bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow flex items-center justify-center space-x-1"
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>Submit Workshop Quote</span>
                    </button>
                  </div>
                ))}
              </div>

            </div>

            {/* Live Milestone Sync Card */}
            <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3 shadow-lg">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#EA580C] flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Live Milestone Sync</span>
                </h3>
                <p className="text-[10px] text-slate-400">Active Project: Teak Patio Set (Order #99210)</p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-white">
                  <span>Structure Assembly</span>
                  <span className="text-emerald-400">80% Complete</span>
                </div>
                <div className="w-full h-2 bg-[#120B08] rounded-full overflow-hidden border border-[#2A1E17]">
                  <div className="h-full bg-gradient-to-r from-[#EA580C] to-emerald-500 w-[80%] rounded-full" />
                </div>
              </div>

              {/* Photo Upload Zone */}
              <div
                onClick={() => setIsPhotoUploaded(true)}
                className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${
                  isPhotoUploaded
                    ? 'border-emerald-500 bg-emerald-950/20'
                    : 'border-[#3E2E24] bg-[#120B08]'
                }`}
              >
                {isPhotoUploaded ? (
                  <div className="space-y-0.5 text-emerald-400">
                    <Check className="w-5 h-5 mx-auto" />
                    <p className="text-xs font-bold">Workshop Photo Attached!</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 text-slate-400">
                    <Upload className="w-5 h-5 mx-auto text-[#EA580C]" />
                    <p className="text-xs font-bold text-white">Add Photo Proof</p>
                    <p className="text-[9px]">Tap to attach live workshop snapshot</p>
                  </div>
                )}
              </div>

              {/* Primary Sync CTA */}
              <button
                onClick={handleSyncMilestone}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow flex items-center justify-center space-x-1.5"
              >
                {isSyncCompleted ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Synced to Buyer!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Sync Milestone to Buyer</span>
                  </>
                )}
              </button>
            </div>

            {/* Financial Payout Card */}
            <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Wallet & Payout</h3>
                <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                  Escrow Verified
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#120B08] border border-[#2A1E17]">
                <span className="text-[10px] text-slate-400">Available for Payout</span>
                <p className="text-2xl font-mono font-bold text-[#EAB308] mt-0.5">
                  ₹{wallet.availableBalance.toLocaleString('en-IN')}
                </p>
              </div>

              <button 
                onClick={() => setIsWithdrawModalOpen(true)}
                disabled={wallet.availableBalance <= 0}
                className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 ${
                  wallet.availableBalance > 0
                    ? 'bg-[#120B08] text-[#EAB308] border border-[#EAB308]/40'
                    : 'bg-[#120B08] text-slate-500 border border-[#2A1E17] opacity-50 cursor-not-allowed'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Withdraw to Bank</span>
              </button>
            </div>

          </div>
        )}

        {/* Public Storefront Showcase */}
        {activeSidebarTab === 'radar' && activeSubTab === 'Showcase' && (
          <div className="mt-2">
            <KaragirProfileCard />
          </div>
        )}

        {/* Directory Tab */}
        {activeSidebarTab === 'radar' && activeSubTab === 'Directory' && (
          <div className="flex flex-col items-center justify-center p-8 bg-[#1A120E] border border-[#2A1E17] rounded-2xl space-y-2 text-center">
            <FolderKanban className="w-8 h-8 text-[#EA580C] opacity-50" />
            <h2 className="text-sm font-bold text-white">Artisan Directory</h2>
            <p className="text-xs text-slate-400">Discover other verified craftsmen in the Nashik region.</p>
          </div>
        )}

        {/* Active Projects Tab */}
        {activeSidebarTab === 'projects' && (
          <MilestoneTracker isArtisanView={true} />
        )}

        {/* Messages & Quotes Tab */}
        {activeSidebarTab === 'messages' && (
          <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#EA580C]" />
              <span>Quotes & Inquiries</span>
            </h3>
            <p className="text-xs text-slate-400">All direct inquiries from buyers will appear here in real time.</p>
          </div>
        )}

        {/* Earnings & Wallet Tab */}
        {activeSidebarTab === 'earnings' && (
          <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-[#EA580C]" />
              <span>Escrow Vault & Earnings</span>
            </h3>
            <div className="p-3 bg-[#120B08] rounded-xl border border-[#2A1E17] space-y-1">
              <span className="text-[10px] text-slate-400">Available Balance:</span>
              <p className="text-xl font-mono font-bold text-[#EAB308]">₹{wallet.availableBalance.toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}

        {/* Workshop Profile Tab */}
        {activeSidebarTab === 'profile' && (
          <WorkshopProfileEditor storeData={storeData} saveStoreProfile={saveStoreProfile} />
        )}

        {/* Catalog & Categories Tab */}
        {activeSidebarTab === 'catalog' && (
          <CatalogEditor storeData={storeData} addWorkItem={addWorkItem} />
        )}

      </main>

      {/* Submit Quote Modal */}
      {quoteModalRequest && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="relative w-full max-w-md bg-[#1A120E] border-t-2 sm:border border-[#3E2E24] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
            
            <div className="flex items-start justify-between border-b border-[#2A1E17] pb-3">
              <div>
                <span className="text-[9px] uppercase font-bold text-[#EA580C]">Submit Workshop Quote</span>
                <h3 className="text-sm font-bold text-white">{quoteModalRequest.title}</h3>
                <p className="text-[10px] text-slate-400">Buyer: {quoteModalRequest.buyerName} • {quoteModalRequest.locality}</p>
              </div>

              <button
                onClick={() => setQuoteModalRequest(null)}
                className="w-7 h-7 rounded-full bg-[#120B08] text-slate-400 hover:text-white flex items-center justify-center border border-[#2A1E17]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Quote Price (₹):</label>
                <input
                  type="number"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Timeline (Weeks):</label>
                <input
                  type="number"
                  value={timelineWeeks}
                  onChange={(e) => setTimelineWeeks(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Notes & Guarantee:</label>
                <textarea
                  rows={2}
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={handleSendQuote}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#EA580C] hover:bg-[#F97316] shadow flex items-center justify-center space-x-1.5"
              >
                {isQuoteSent ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Quote Sent to Buyer!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Official Quote</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <WithdrawModal onClose={() => setIsWithdrawModalOpen(false)} />
      )}
    </div>
  );
};
