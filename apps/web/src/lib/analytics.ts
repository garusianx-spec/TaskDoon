/**
 * TaskDoon Analytics & Conversion Tracking Specification
 * Next.js App Router, GA4, GTM, and Meta Pixel helpers.
 * Path: /Users/Mehdi/OpenBot/Shared/taskdoon-analytics/analytics.ts
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export type PricingPlanId = 'free' | 'team' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanDetails {
  readonly planId: PricingPlanId;
  readonly planName: string;
  readonly price: number; // in Tomans (0 for free)
  readonly currency?: string; // Default: 'IRR' or 'IRT'
  readonly billingCycle?: BillingCycle;
  readonly teamSize?: number;
}

/**
 * Core event dispatcher
 */
function pushGa4Event(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...params,
    timestamp: Date.now(),
  });

  if (process.env.NODE_ENV === 'development') {
    console.info(`📊 [Analytics Event] ${eventName}:`, params);
  }
}

/**
 * 1. view_pricing
 * Triggered when pricing page or pricing section renders.
 */
export function trackViewPricing(params?: { source?: string; pageUrl?: string }) {
  pushGa4Event('view_pricing', {
    page_location: params?.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''),
    traffic_source: params?.source ?? 'direct',
  });

  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'ViewContent', { content_name: 'Pricing Plans' });
  }
}

/**
 * 2. select_team_size & toggle_billing_cycle
 * Interactive pricing configurator events
 */
export function trackTeamSizeSelect(teamSize: number, estimatedPrice: number, billingCycle: BillingCycle = 'monthly') {
  pushGa4Event('select_team_size', {
    team_size: teamSize,
    value: estimatedPrice,
    currency: 'IRR',
    billing_cycle: billingCycle,
  });
}

export function trackBillingToggle(billingCycle: BillingCycle) {
  pushGa4Event('toggle_billing_cycle', {
    billing_cycle: billingCycle,
    has_discount: billingCycle === 'yearly',
  });
}

/**
 * 3. select_pro_plan
 * Triggered on plan selection CTA click.
 */
export function trackSelectProPlan(plan: PlanDetails) {
  pushGa4Event('select_pro_plan', {
    item_id: plan.planId,
    item_name: plan.planName,
    value: plan.price,
    currency: plan.currency ?? 'IRR',
    billing_cycle: plan.billingCycle ?? 'monthly',
    team_size: plan.teamSize ?? 10,
  });

  pushGa4Event('select_item', {
    item_list_id: 'pricing_table',
    item_list_name: 'TaskDoon Pricing',
    items: [
      {
        item_id: plan.planId,
        item_name: plan.planName,
        price: plan.price,
        item_category: 'Subscription',
        quantity: plan.teamSize ?? 1,
      },
    ],
  });

  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('trackCustom', 'SelectPlan', {
      plan_name: plan.planName,
      price: plan.price,
      team_size: plan.teamSize,
    });
  }
}

/**
 * 4. cta_clicked (General & Hero CTAs)
 */
export function trackCtaClick(location: 'hero' | 'header' | 'footer' | 'pricing' | 'features', ctaText: string, targetUrl: string) {
  pushGa4Event('cta_clicked', {
    cta_location: location,
    cta_text: ctaText,
    target_url: targetUrl,
  });
}

/**
 * 5. initiate_checkout / demo_request_submitted
 * Triggered on demo request form submission or entering checkout.
 */
export function trackInitiateCheckout(plan: PlanDetails, formDetails?: { companyName?: string; teamSize?: string; role?: string }) {
  pushGa4Event('initiate_checkout', {
    item_id: plan.planId,
    item_name: plan.planName,
    value: plan.price,
    currency: plan.currency ?? 'IRR',
    team_size_range: formDetails?.teamSize,
  });

  pushGa4Event('begin_checkout', {
    value: plan.price,
    currency: plan.currency ?? 'IRR',
    items: [{ item_id: plan.planId, item_name: plan.planName, price: plan.price }],
  });

  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'InitiateCheckout', {
      content_name: plan.planName,
      value: plan.price,
      currency: plan.currency ?? 'IRR',
    });
  }
}

export function trackDemoFormSubmit(data: { teamSize?: string; role?: string; companyName?: string }) {
  pushGa4Event('demo_request_submitted', {
    team_size: data.teamSize ?? 'unknown',
    role: data.role ?? 'unknown',
    has_company: Boolean(data.companyName),
  });

  pushGa4Event('generate_lead', {
    currency: 'IRR',
    value: 0,
  });
}

/**
 * 6. signup_completed
 * Triggered after successful OTP verification.
 */
export function trackSignupCompleted(params: {
  userId: string;
  method?: 'sms_otp' | 'password' | 'invitation';
  workspaceCreated?: boolean;
}) {
  pushGa4Event('signup_completed', {
    user_id: params.userId,
    sign_up_method: params.method ?? 'sms_otp',
    workspace_created: Boolean(params.workspaceCreated),
  });

  pushGa4Event('sign_up', {
    method: params.method ?? 'sms_otp',
  });

  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'CompleteRegistration', { status: 'success' });
  }
}

/**
 * 7. purchase_success
 * Triggered when payment callback succeeds or contract is approved.
 */
export function trackPurchaseSuccess(params: {
  transactionId: string;
  plan: PlanDetails;
  amountPaid: number;
  tax?: number;
}) {
  pushGa4Event('purchase_success', {
    transaction_id: params.transactionId,
    item_id: params.plan.planId,
    item_name: params.plan.planName,
    value: params.amountPaid,
    currency: params.plan.currency ?? 'IRR',
  });

  pushGa4Event('purchase', {
    transaction_id: params.transactionId,
    value: params.amountPaid,
    currency: params.plan.currency ?? 'IRR',
    tax: params.tax ?? 0,
    items: [
      {
        item_id: params.plan.planId,
        item_name: params.plan.planName,
        price: params.amountPaid,
      },
    ],
  });

  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'Purchase', {
      value: params.amountPaid,
      currency: params.plan.currency ?? 'IRR',
    });
  }
}
