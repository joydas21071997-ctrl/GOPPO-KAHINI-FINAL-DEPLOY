import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type {
  CheckoutState,
  Language,
  OrderItemType,
  OrderRecord,
  StoryItem,
  UserProfile,
} from '../types/content';
import type { UIStrings } from '../i18n/translations';

interface CheckoutModalProps {
  isOpen: boolean;
  itemType: OrderItemType;
  story?: StoryItem;
  nPassPriceInr: number;
  language: Language;
  t: UIStrings;
  user: UserProfile | null;
  authToken: string | null;
  onClose: () => void;
  onRequireLogin: () => void;
  onOrderUpdated: (payload: {
    user?: UserProfile;
    orders: OrderRecord[];
    unlockedStory?: StoryItem;
  }) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  itemType,
  story,
  nPassPriceInr,
  language,
  t,
  user,
  authToken,
  onClose,
  onRequireLogin,
  onOrderUpdated,
}) => {
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('ready');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);
  const [sandboxBusy, setSandboxBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCheckoutState('ready');
      setActiveOrder(null);
      setSandboxBusy(false);
    }
  }, [isOpen, story?.id, itemType]);

  if (!isOpen) return null;

  const amountInr = itemType === 'npass_monthly' ? nPassPriceInr : story?.ticketPriceInr ?? 9;
  const itemTitle = itemType === 'npass_monthly' ? t.npass.title : story?.title ?? '';

  const createBackendOrder = async (): Promise<OrderRecord | null> => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        itemType,
        storyId: story?.id,
        paymentMethod,
        language,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.order as OrderRecord;
  };

  const handleStandardPaymentAttempt = async () => {
    if (!user || !authToken) {
      onRequireLogin();
      return;
    }
    setCheckoutState('pending');
    try {
      const created = activeOrder?.status === 'PENDING' ? activeOrder : await createBackendOrder();
      if (!created) {
        setCheckoutState('failed');
        return;
      }
      setActiveOrder(created);

      // Brief verification step against backend payment endpoint
      await new Promise((r) => setTimeout(r, 650));
      const verifyRes = await fetch(`/api/orders/${created.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.ok && verifyData.verified) {
        setActiveOrder(verifyData.order);
        setCheckoutState('successful');
        onOrderUpdated({
          user: verifyData.user,
          orders: verifyData.orders || [],
          unlockedStory: story,
        });
      } else {
        setActiveOrder(verifyData.order || created);
        setCheckoutState('failed');
        if (verifyData.orders) {
          onOrderUpdated({ orders: verifyData.orders });
        }
      }
    } catch {
      setCheckoutState('failed');
    }
  };

  const handleSandboxTestVerification = async () => {
    if (!user || !authToken) {
      onRequireLogin();
      return;
    }
    setSandboxBusy(true);
    setCheckoutState('pending');
    try {
      const orderToVerify = activeOrder || (await createBackendOrder());
      if (!orderToVerify) {
        setCheckoutState('failed');
        setSandboxBusy(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`/api/orders/${orderToVerify.orderId}/sandbox-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setActiveOrder(data.order);
        setCheckoutState('successful');
        onOrderUpdated({
          user: data.user,
          orders: data.orders || [],
          unlockedStory: story,
        });
      } else {
        setCheckoutState('failed');
      }
    } catch {
      setCheckoutState('failed');
    } finally {
      setSandboxBusy(false);
    }
  };

  const handleRetry = () => {
    setActiveOrder(null);
    setCheckoutState('ready');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden text-[#F5F2EB]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/[0.06] bg-[#120F16]/90 backdrop-blur-md">
          <div>
            <h2 className="font-editorial text-lg sm:text-xl font-bold text-[#F5F2EB]">
              {itemType === 'npass_monthly'
                ? t.checkout.modalTitleNPass
                : t.checkout.modalTitleTicket}
            </h2>
            <p className="text-xs text-red-400 font-medium pt-0.5">
              {checkoutState === 'ready' && t.checkout.stateReady}
              {checkoutState === 'pending' && t.checkout.statePending}
              {checkoutState === 'successful' && t.checkout.stateSuccess}
              {checkoutState === 'failed' && t.checkout.stateFailed}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#A69E95] hover:text-[#F5F2EB] hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Shared Order Summary */}
          <div className="rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] p-4 space-y-2.5 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-[#A69E95]">{t.checkout.itemLabel}</span>
              <span className="font-editorial font-semibold text-[#F5F2EB] text-right">
                {itemTitle}
              </span>
            </div>
            {story && (
              <>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-[#A69E95]">{t.checkout.languageLabel}</span>
                  <span className="text-[#F5F2EB]">
                    {story.language === 'bn' ? 'বাংলা' : 'हिंदी'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-[#A69E95]">{t.checkout.accessTermsLabel}</span>
                  <span className="text-emerald-300 font-medium text-right">
                    {t.checkout.accessTermsAdFree}
                  </span>
                </div>
              </>
            )}
            <div className="pt-2.5 border-t border-white/[0.06] flex items-baseline justify-between">
              <span className="font-medium text-[#F5F2EB]">{t.checkout.totalPayable}</span>
              <span className="font-mono-num text-2xl font-bold text-[#EF4444]">
                ₹{amountInr}
              </span>
            </div>
          </div>

          {!user ? (
            <div className="rounded-xl bg-gradient-to-b from-[#18131B] to-[#0E0C12] border border-red-500/20 p-5 space-y-3.5 text-center">
              <p className="text-sm text-[#F5F2EB] leading-relaxed">{t.checkout.loginRequiredNote}</p>
              <button
                type="button"
                onClick={onRequireLogin}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-sm transition-all shadow-md shadow-red-950/30 cursor-pointer"
              >
                {t.checkout.goToLogin}
              </button>
            </div>
          ) : (
            <>
              {/* STATE 1: READY TO PAY */}
              {checkoutState === 'ready' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#A69E95]">
                      {t.checkout.selectPaymentMethod}
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {(
                        [
                          { id: 'upi', label: t.checkout.methodUpi },
                          { id: 'card', label: t.checkout.methodCard },
                          { id: 'netbanking', label: t.checkout.methodNetbanking },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left text-sm transition-all cursor-pointer ${
                            paymentMethod === m.id
                              ? 'bg-gradient-to-r from-red-500/15 via-red-500/5 to-transparent border-red-500/35 text-[#F5F2EB] shadow-sm'
                              : 'bg-white/[0.02] border-white/[0.06] text-[#A69E95] hover:text-[#F5F2EB] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <CreditCard className={`h-4 w-4 ${paymentMethod === m.id ? 'text-[#EF4444]' : 'text-[#8C847C]'}`} />
                            <span>{m.label}</span>
                          </span>
                          <span className="font-mono-num text-xs font-semibold text-[#EF4444]">
                            ₹{amountInr}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStandardPaymentAttempt}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-sm transition-all shadow-lg shadow-red-950/30 cursor-pointer"
                  >
                    {t.checkout.proceedToPay} · <span className="font-mono-num">₹{amountInr}</span>
                  </button>

                  {/* QA / Sandbox Backend Verification Option */}
                  <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                    <button
                      type="button"
                      disabled={sandboxBusy}
                      onClick={handleSandboxTestVerification}
                      className="w-full py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] text-xs font-medium text-red-400 hover:text-red-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 text-[#EF4444]" />
                      <span>{t.checkout.sandboxVerifyButton}</span>
                    </button>
                    <p className="text-[11px] text-[#A69E95]/75 text-center">
                      {t.checkout.sandboxDisclaimer}
                    </p>
                  </div>
                </div>
              )}

              {/* STATE 2: PAYMENT PENDING */}
              {checkoutState === 'pending' && (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="h-9 w-9 text-[#EF4444] animate-spin" />
                  <p className="text-base font-semibold text-[#F5F2EB]">
                    {t.checkout.statePending}
                  </p>
                  <p className="text-xs text-[#A69E95] max-w-sm">
                    {t.checkout.gatewayPendingMessage}
                  </p>
                </div>
              )}

              {/* STATE 3: PAYMENT FAILED + RETRY */}
              {checkoutState === 'failed' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gradient-to-b from-[#1C1216] to-[#120B0E] border border-red-500/30 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F2EB]">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>{t.checkout.gatewayNotAuthorizedTitle}</span>
                    </div>
                    <p className="text-xs text-[#A69E95] leading-relaxed">
                      {t.checkout.gatewayNotAuthorizedBody}
                    </p>
                    {activeOrder && (
                      <p className="font-mono-num text-xs text-red-400 pt-1">
                        {t.checkout.orderConfirmedLabel}: {activeOrder.orderId}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold transition-all cursor-pointer shadow-md shadow-red-950/30"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>{t.checkout.retryPayment}</span>
                    </button>

                    <button
                      type="button"
                      disabled={sandboxBusy}
                      onClick={handleSandboxTestVerification}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 text-[#EF4444]" />
                      <span>{t.checkout.sandboxVerifyButton}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STATE 4: PAYMENT SUCCESSFUL (ORDER CONFIRMATION) */}
              {checkoutState === 'successful' && (
                <div className="space-y-4 text-center py-3">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30 text-[#EF4444]">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-editorial text-xl font-bold text-[#F5F2EB]">
                      {t.checkout.stateSuccess}
                    </h3>
                    {activeOrder && (
                      <p className="font-mono-num text-xs text-red-400">
                        {t.checkout.orderConfirmedLabel}: {activeOrder.orderId} · ₹{activeOrder.amountInr}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-sm transition-all shadow-lg shadow-red-950/30 cursor-pointer"
                  >
                    {t.checkout.closeAndListen}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
