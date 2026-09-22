import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import type { SubscriptionService } from "./services/subscription-service.js";
import type { StripeConfig } from "./services/stripe-config.js";

const CREATE_CHECKOUT_SCHEMA = z.object({
  priceId: z.string(),
  tier: z.enum(["pro", "business"]),
});

const CREATE_PORTAL_SCHEMA = z.object({
  customerId: z.string(),
});

interface StripeRouteOptions {
  stripe: Stripe;
  config: StripeConfig;
  subscriptions: SubscriptionService;
}

export function registerStripeRoutes(
  app: FastifyInstance,
  options: StripeRouteOptions
): void {
  const { stripe, config, subscriptions } = options;

  app.post("/api/stripe/create-checkout-session", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = CREATE_CHECKOUT_SCHEMA.parse(request.body);
      
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: body.priceId,
            quantity: 1,
          },
        ],
        success_url: `${config.PUBLIC_SITE_URL}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.PUBLIC_SITE_URL}/pricing?canceled=true`,
        metadata: {
          tier: body.tier,
        },
        allow_promotion_codes: true,
        billing_address_collection: "required",
      });

      return { url: session.url };
    } catch (error) {
      request.log.error({ error }, "Failed to create checkout session");
      return reply.code(500).send({ 
        code: "CHECKOUT_ERROR", 
        message: "Failed to create checkout session" 
      });
    }
  });

  app.post("/api/stripe/create-portal-session", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = CREATE_PORTAL_SCHEMA.parse(request.body);
      
      const session = await stripe.billingPortal.sessions.create({
        customer: body.customerId,
        return_url: `${config.PUBLIC_SITE_URL}/pricing`,
      });

      return { url: session.url };
    } catch (error) {
      request.log.error({ error }, "Failed to create portal session");
      return reply.code(500).send({ 
        code: "PORTAL_ERROR", 
        message: "Failed to create portal session" 
      });
    }
  });

  app.post("/api/stripe/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers["stripe-signature"];
    
    if (!signature || !config.STRIPE_WEBHOOK_SECRET) {
      return reply.code(400).send({ code: "INVALID_SIGNATURE", message: "Missing signature" });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer | string,
        signature,
        config.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      request.log.error({ error }, "Webhook signature verification failed");
      return reply.code(400).send({ code: "INVALID_SIGNATURE", message: "Invalid signature" });
    }

    try {
      await handleStripeEvent(event, subscriptions, request);
      return { received: true };
    } catch (error) {
      request.log.error({ error, eventType: event.type }, "Failed to process webhook event");
      return reply.code(500).send({ code: "WEBHOOK_ERROR", message: "Failed to process event" });
    }
  });
}

async function handleStripeEvent(
  event: Stripe.Event,
  subscriptions: SubscriptionService,
  request: FastifyRequest
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.mode === "subscription" && session.customer && session.customer_details?.email) {
        const user = await subscriptions.findOrCreateUser(
          session.customer_details.email,
          session.customer as string
        );

        if (session.subscription) {
          const subscription = await request.server.stripe.subscriptions.retrieve(
            session.subscription as string
          );
          
          const tier = (session.metadata?.tier as "pro" | "business") || "pro";
          const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;
          
          await subscriptions.upsertSubscription(
            user.id,
            subscription.id,
            subscription.items.data[0]!.price.id,
            tier,
            subscription.status,
            periodEnd ? new Date(periodEnd * 1000) : null
          );
        }
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      
      const user = await subscriptions.getUserByStripeCustomerId(subscription.customer as string);
      
      if (user) {
        await subscriptions.updateSubscriptionStatus(
          subscription.id,
          subscription.status,
          subscription.cancel_at_period_end
        );
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = (invoice as unknown as { subscription?: string }).subscription;
      
      if (invoiceSubscription && typeof invoiceSubscription === "string") {
        const subscription = await request.server.stripe.subscriptions.retrieve(
          invoiceSubscription
        );
        
        const user = await subscriptions.getUserByStripeCustomerId(subscription.customer as string);
        
        if (user) {
          const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;
          
          await subscriptions.upsertSubscription(
            user.id,
            subscription.id,
            subscription.items.data[0]!.price.id,
            (subscription.metadata?.tier as "pro" | "business") || "pro",
            subscription.status,
            periodEnd ? new Date(periodEnd * 1000) : null
          );
        }
      }
      break;
    }

    default:
      request.log.info({ eventType: event.type }, "Unhandled webhook event type");
  }
}

declare module "fastify" {
  interface FastifyInstance {
    stripe: Stripe;
  }
}
