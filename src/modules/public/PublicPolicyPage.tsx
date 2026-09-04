import type { ReactNode } from 'react';

export type PublicPolicyKey = 'terms' | 'privacy' | 'refund-cancellation' | 'payment-policy' | 'pickup-policy' | 'contact';

type PolicySection = { title: string; body: ReactNode };

type PolicyDocument = {
  title: string;
  updated?: string;
  intro?: ReactNode;
  sections: PolicySection[];
};

const ContactUsLink = ({ children = 'Contact Us' }: { children?: ReactNode }) => (
  <a className="font-extrabold text-primary underline" href="/contact-us">{children}</a>
);

const BusinessIdentity = () => (
  <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 font-sans text-sm font-bold leading-7 text-on-surface-variant">
    <p className="font-extrabold text-primary">MiseChef</p>
    <p>Operated by CL WISE EMPIRE</p>
    <p>Business Registration No.: 003882452-K</p>
    <p>44, Laluan Pakatan Jaya 3, Taman Pakatan Jaya, 31150 Ulu Kinta, Perak, Malaysia</p>
    <p>Email: <a className="text-primary underline" href="mailto:misechef.ai@gmail.com">misechef.ai@gmail.com</a></p>
    <p>WhatsApp Us: <a className="text-primary underline" href="https://wa.me/60164209116">016-420 9116</a></p>
  </div>
);

const contactSection: PolicySection = {
  title: 'Contact Us',
  body: <><BusinessIdentity /><p className="mt-4">For Order-related enquiries, please provide your Order Number where available.</p></>
};

const terms: PolicyDocument = {
  title: 'MiseChef Terms & Conditions', updated: '28 August 2026',
  intro: <>These Terms & Conditions govern your use of the website and online ordering services provided by MiseChef, operated by CL WISE EMPIRE, Business Registration No. 003882452-K, registered in Malaysia. By accessing our website or placing an order, you agree to these Terms and, where applicable, our Privacy Notice, Refund & Cancellation Policy, Payment Policy, and Pickup & Order Fulfilment Policy.</>,
  sections: [
    { title: '1. Introduction & Acceptance', body: <>These Terms govern your use of MiseChef and its online ordering services.</> },
    { title: '2. Definitions', body: <>“Customer” or “you” means the person placing an Order. “Order” means an order for Products placed through MiseChef. “Products” means food, beverages and related items offered for sale through MiseChef.</> },
    { title: '3. Our Service & Eligibility', body: <>MiseChef provides online ordering primarily for self-pickup unless another fulfilment method is expressly offered. Product availability may vary due to stock, preparation capacity, operating hours and other operational circumstances. You must be at least 18 years old or have parent or legal guardian consent to place an Order.</> },
    { title: '4. Product Information & Allergens', body: <>We make reasonable efforts to keep Product descriptions, prices and information accurate. Product images are illustrative and actual appearance, portion presentation and packaging may reasonably vary. Our kitchen handles common allergens including nuts, dairy, gluten and shellfish; cross-contact may occur. Customers with allergies, intolerances or dietary requirements should contact us before ordering.</> },
    { title: '5. Prices & Charges', body: <>Prices and payments are displayed in the currency applicable to the relevant Store, market or transaction. The applicable currency and total amount payable, including applicable charges, will be clearly shown before Order confirmation. Availability of currencies and payment methods may vary by country, Store and payment provider. We may correct genuine pricing or listing errors. If a material pricing error affects a paid Order that we cancel, an appropriate refund will be arranged.</> },
    { title: '6. Orders & Acceptance', body: <>An Order is submitted when checkout is completed, but submission does not necessarily mean final acceptance. Acceptance may depend on successful payment verification and our ability to fulfil the Order. We may reject or cancel an Order for unavailability, unverifiable payment, incorrect information, suspected fraud or duplication, technical or operational problems, or circumstances beyond our reasonable control. Paid Orders cancelled by us will be handled under our Refund & Cancellation Policy.</> },
    { title: '7. Payment', body: <>Use only payment methods made available at checkout. Third-party payment providers may apply their own terms and privacy practices. For manual QR, bank transfer or e-wallet payments, pay the displayed amount and submit proof if requested. Uploading proof does not itself confirm payment; MiseChef may verify payment before preparation. MiseChef does not ask for full card credentials as part of the manual payment-proof process.</> },
    { title: '8. Pickup', body: <>Check the confirmed pickup date, time, location and instructions for your Order and collect within the communicated period. Substantial collection delays may affect food quality and temperature. A prepared Order that is not collected within a reasonable period will generally not qualify for a change-of-mind refund, subject to applicable law and our Refund & Cancellation Policy.</> },
    { title: '9. Changes, Cancellations & Refunds', body: <>Requests to modify or cancel should be made as soon as possible through our <ContactUsLink /> page. Once preparation has commenced, change-of-mind modification or cancellation may no longer be possible. Refunds, cancellations, incorrect Orders, missing Products and other Order problems are governed by our Refund & Cancellation Policy. Nothing limits consumer rights that cannot lawfully be excluded.</> },
    { title: '10. Customer Information & Privacy', body: <>You must provide information reasonably accurate and sufficient for us to process and fulfil your Order. Personal data is handled under our Privacy Notice and applicable Malaysian personal data protection requirements, including the Personal Data Protection Act 2010 where applicable.</> },
    { title: '11. Acceptable Use', body: <>Do not submit fraudulent Orders or payment proof, interfere with the website or systems, misuse promotions, Group Order, Host or reward functions, impersonate another person, or use MiseChef unlawfully. We may cancel affected Orders or restrict access where reasonably necessary to protect customers, MiseChef or our systems.</> },
    { title: '12. Intellectual Property', body: <>Unless otherwise stated, the MiseChef name, branding, logos, website content, original photographs, text, graphics and design elements are owned by or licensed to CL WISE EMPIRE. They may not be reproduced, distributed or commercially exploited without permission except where permitted by law.</> },
    { title: '13. Liability', body: <>We exercise reasonable care and skill in preparing and fulfilling accepted Orders. To the extent permitted by Malaysian law, we are not responsible for indirect or consequential loss beyond what can reasonably be attributed to our Products or services. Nothing excludes liability, statutory guarantees, consumer rights or remedies that cannot lawfully be excluded.</> },
    { title: '14. Events Beyond Our Reasonable Control', body: <>We are not responsible for failure or delay caused by events beyond our reasonable control to the extent permitted by law. Where such an event materially affects an accepted paid Order, we will take reasonable steps to communicate and provide an appropriate resolution.</> },
    { title: '15. Severability', body: <>If any provision is invalid or unenforceable, the remaining provisions continue to apply to the extent permitted by law.</> },
    { title: '16. Changes to These Terms', body: <>We may update these Terms as services, operational processes, payment methods or legal obligations change. The latest version will be published on the MiseChef website with its updated date.</> },
    { title: '17. Governing Law', body: <>These Terms are governed by the laws of Malaysia. Disputes will be dealt with under applicable Malaysian law and lawful dispute-resolution mechanisms.</> },
    contactSection
  ]
};

const privacy: PolicyDocument = {
  title: 'MiseChef Privacy Notice', updated: '28 August 2026',
  intro: <>This Privacy Notice explains how CL WISE EMPIRE, operating under the MiseChef brand, collects, uses, discloses, stores and otherwise processes personal data when you use our website, place an order, communicate with us or use other MiseChef services. Business Registration No.: 003882452-K. CL WISE EMPIRE is the data controller in respect of personal data that we control for applicable Malaysian personal data protection law.</>,
  sections: [
    { title: '1. Personal Data We May Collect', body: <>Depending on how you use MiseChef, we may process contact information; Order information; payment method, status, references and payment proof; account information; Host, Group Order and reward information; communications; and technical and security information such as IP address, device/browser information, timestamps, application activity, authentication information, system logs and fraud or security signals. Please do not put unnecessary sensitive information in free-text fields.</> },
    { title: '2. Sources of Personal Data', body: <>We may receive personal data directly from you when you order, create or use an account, upload payment proof, use Host or Group Order features, or contact us; automatically through our website and supporting technology; from payment or technology providers where necessary; or from another person who legitimately supplies information for an Order involving you.</> },
    { title: '3. Why We Process Personal Data', body: <>Purposes include processing and fulfilling Orders, verifying payments, managing pickup, communicating service information, handling complaints and refunds, operating customer and Host features, administering Group Orders and rewards, keeping business and accounting records, preventing fraud, protecting systems, diagnosing technical problems, complying with legal and regulatory requirements, and establishing or defending legal rights.</> },
    { title: '4. Direct Marketing', body: <>We use personal data for promotional or direct-marketing communications only in accordance with applicable requirements. You may ask us to stop direct marketing. Operational communications about Orders, payment, pickup, security or customer service are not optional marketing merely because the same contact channel is used.</> },
    { title: '5. Disclosure of Personal Data', body: <>We do not sell your personal data. Where reasonably necessary, information may be disclosed to payment, hosting, cloud, database, authentication, security and communications providers; professional advisers; operational contractors; government departments, regulators, courts or law enforcement where permitted or required; and legitimate business successors subject to applicable law.</> },
    { title: '6. Third-Party Payment Services', body: <>A third-party payment provider may independently collect and process payment information under its own terms and privacy practices. MiseChef may receive transaction information such as status, reference and amount without receiving full payment credentials.</> },
    { title: '7. Cookies and Similar Technologies', body: <>MiseChef may use cookies, local storage or similar technologies to maintain sessions, remember settings, provide authentication and website functionality, protect against abuse, and understand or improve technical performance. We will update our practices if non-essential technologies requiring additional notice or choice are introduced.</> },
    { title: '8. Security', body: <>We take reasonable steps to protect personal data using measures such as access controls, authentication, security rules, logging and reputable infrastructure providers. No internet-based system can be guaranteed completely secure. Do not send us passwords, PINs, OTPs or secret banking authentication information.</> },
    { title: '9. Retention', body: <>We keep personal data only as long as reasonably necessary for its purpose and legitimate operational, accounting, tax, dispute-resolution, security and legal needs. When data is no longer reasonably required, appropriate deletion, destruction or anonymisation steps are taken subject to legal and technical requirements.</> },
    { title: '10. Your Rights and Choices', body: <>Subject to the Personal Data Protection Act 2010 and other applicable requirements, you may have rights to information, access, correction, withdrawal of consent where applicable, prevention or cessation of certain processing, objection to direct marketing, and other rights provided by Malaysian personal data protection law. We may need to verify your identity before processing a request.</> },
    { title: '11. Consequences of Not Providing Information', body: <>Some information is necessary to process and fulfil an Order. Without sufficient contact, Order or payment-verification information, we may be unable to process or verify an Order, communicate important information, prepare the correct Products, manage pickup or respond effectively to a refund or support request.</> },
    { title: '12. Personal Data of Other People', body: <>If you provide another person's personal data, ensure you are authorised to do so and that the person is appropriately informed where required. Provide only information reasonably necessary for the relevant Order or service.</> },
    { title: '13. Children’s Personal Data', body: <>MiseChef is not designed to intentionally collect unnecessary personal data from children. Orders should be placed by a person aged 18 or above or with appropriate parent or guardian consent. Contact us if you believe a child's personal data was provided improperly.</> },
    { title: '14. Cross-Border Processing', body: <>Some technology or service providers may process or store information outside Malaysia. Cross-border processing will be handled in accordance with applicable Malaysian personal data protection requirements.</> },
    { title: '15. Data Breach and Security Incidents', body: <>If a personal data breach or security incident occurs, MiseChef will assess and respond reasonably. Where Malaysian law requires notification to the Personal Data Protection Commissioner or affected individuals, we will take steps to comply.</> },
    { title: '16. Changes to This Privacy Notice', body: <>We may update this Notice as services, technologies, payment methods, business processes or legal obligations change. The latest version will be published on the MiseChef website with its updated date.</> },
    { title: '17. Contact Us', body: <><BusinessIdentity /><p className="mt-4">For privacy questions, access or correction requests, withdrawal of consent, direct-marketing objections or other personal-data enquiries, contact us using the details above. Do not send passwords, PINs or OTPs.</p></> }
  ]
};

const refund: PolicyDocument = {
  title: 'MiseChef Refund & Cancellation Policy', updated: '28 August 2026',
  intro: <>This Policy applies to Store Orders placed through MiseChef, operated by CL WISE EMPIRE (003882452-K), and separately explains the treatment of subscriptions and digital services. It forms part of our Terms & Conditions and should be read together with our Payment Policy and Pickup & Order Fulfilment Policy.</>,
  sections: [
    { title: '1. How to Cancel an Order', body: <>If you wish to request a cancellation or modification, please contact MiseChef as soon as possible through our <ContactUsLink /> page and provide your Order Number. Requests made before preparation begins may be considered subject to the applicable Store’s cancellation terms. Once preparation has started, cancellation, modification or refund may no longer be available because ingredients, preparation time and labour may already have been committed. This does not affect consumer rights that cannot lawfully be excluded.</> },
    { title: '2. When You May Be Eligible for an Order Remedy', body: <>Contact us promptly if you receive the wrong Product, a paid Product is missing, a Product is materially different from what was ordered, there is a significant quality or food-safety issue, we cannot supply a paid Product, or you were charged incorrectly. Depending on the circumstances, a remedy may include correction, replacement, partial or full refund, or another reasonable resolution. We may reasonably request your Order Number, issue details, photographs or other relevant information.</> },
    { title: '3. Change-of-Mind Order Refunds', body: <>A refund is generally not available solely because you ordered the wrong Product or quantity, supplied incorrect Order information, changed your mind after preparation started, or collected substantially later than the confirmed pickup time and the issue resulted from that delay. Each case will be assessed under applicable law.</> },
    { title: '4. Late or Failed Pickup', body: <>You are responsible for collecting within the confirmed pickup period. A correctly prepared Order that is not collected within a reasonable period will generally not qualify for a change-of-mind refund. Food quality and temperature may deteriorate if collection is substantially delayed. Contact us as soon as possible if you expect to be late.</> },
    { title: '5. Cancellation by MiseChef', body: <>We may cancel where reasonably necessary because of Product or ingredient unavailability, inability to verify payment, incorrect or insufficient information, suspected fraud or abuse, significant kitchen or operational failure, or circumstances beyond our reasonable control. If MiseChef cancels after receiving valid payment and the Products have not been supplied, we will arrange a full refund of the amount paid for the cancelled Order.</> },
    { title: '6. Payment Verification & Duplicate Payments', body: <>Uploading manual payment proof does not automatically mean payment has been received or verified. If you believe you paid more than once, paid an incorrect amount, or payment succeeded but the Order was not properly recorded, contact us with the Order Number and relevant transaction reference. We will investigate and correct or refund confirmed duplicate or incorrect payments as appropriate.</> },
    { title: '7. Refund Processing', body: <>Where technically possible and appropriate, an approved refund will normally be returned through the original payment method. For manual payments we may request reasonable bank or e-wallet details necessary to return funds, but never your banking password, PIN or OTP. MiseChef processes approved refunds within a reasonable period; the time for funds to appear depends on the payment method and provider. Fraudulent, deliberately misleading or abusive refund claims may be investigated or refused without affecting legitimate complaints or consumer rights.</> },
    { title: '8. Subscriptions & Digital Services', body: <>Subscription plans, software services and other digital services provided by MiseChef are separate from food and Store Orders and may be subject to different cancellation and refund terms. Cancelling a subscription does not automatically entitle the subscriber to a refund for charges already incurred or for a billing period that has already commenced, except where required by applicable law or expressly stated at the time of purchase.</> },
    { title: '9. Consumer Rights', body: <>Nothing in this Policy excludes, restricts or modifies any consumer right, guarantee or remedy that cannot lawfully be excluded under applicable law. Mandatory law prevails where it conflicts with this Policy.</> },
    contactSection
  ]
};

const payment: PolicyDocument = {
  title: 'MiseChef Payment Policy', updated: '28 August 2026',
  intro: <>This Policy explains how payments are handled for orders placed through MiseChef, operated by CL WISE EMPIRE (003882452-K). Please read it together with our Terms & Conditions, Refund & Cancellation Policy and Privacy Notice.</>,
  sections: [
    { title: '1. Currency', body: <>Prices and payments are displayed in the currency applicable to the relevant Store, market or transaction. The applicable currency and total amount payable will be clearly shown before Order confirmation. Availability of currencies and payment methods may vary by country, Store and payment provider.</> },
    { title: '2. Payment Methods', body: <>Available methods are displayed at checkout and may include manual QR payment, bank transfer, supported e-wallet payment and an integrated third-party payment gateway. Not every method is available at all times, and availability may vary by Store, market and payment provider.</> },
    { title: '3. How Payment Works', body: <>For manual QR, bank transfer or e-wallet payments, pay the exact amount and submit proof if requested; MiseChef verifies the payment and preparation begins after successful verification. For a payment gateway, complete payment in the provider's secure payment environment; authentication such as 3D Secure, bank-app approval or OTP is handled by your bank or provider, and preparation begins after MiseChef receives successful confirmation. A proof upload or successful screen on your device alone does not mean MiseChef has received payment confirmation.</> },
    { title: '4. Payment Security', body: <>MiseChef will never ask for a banking password, PIN, OTP or card security code for payment authentication. Sensitive credentials used with a third-party payment provider are handled in that provider's environment rather than intentionally stored by MiseChef as part of the Order record. MiseChef may receive limited transaction information such as status, amount, reference, method/provider and payment date/time.</> },
    { title: '5. Payment Confirmation & Order Status', body: <>Payment Status and Order Status are separate. A successful payment does not mean an Order is immediately ready for pickup. Check your Order status or pickup confirmation. If payment appears successful but the Order remains pending or unpaid, contact us before paying again.</> },
    { title: '6. Failed, Pending, Duplicate or Incorrect Payments', body: <>Payments may fail or remain pending due to bank processing, connectivity, authentication, provider issues or session expiry. Contact us before repeatedly attempting payment. For suspected duplicate payment, provide the Order Number and transaction references. For manual payment, pay the exact displayed amount; an incorrect amount may leave the Order pending while the difference is resolved.</> },
    { title: '7. Fees', body: <>Any fee charged by MiseChef for an Order will be disclosed before Order confirmation where applicable. Your bank, card issuer, e-wallet or payment provider may separately impose charges under its own terms.</> },
    { title: '8. Refunds', body: <>Refunds are handled under our Refund & Cancellation Policy. Where technically possible and appropriate, an approved refund may be returned through the original payment method. Processing time varies by payment method and provider.</> },
    { title: '9. Fraud & Payment Abuse', body: <>MiseChef may hold, reject or cancel an Order where there is reasonable evidence of fraudulent payment, false or altered payment proof, unauthorised transactions, or abuse of the payment or ordering system. We may request reasonable information to verify a transaction before preparing or releasing an Order.</> },
    { title: '10. Contact for Payment Issues', body: <><p>Please use our <ContactUsLink /> page and provide your Order Number and, where relevant, the transaction reference.</p><p className="mt-4">Never send us your password, PIN or OTP.</p></> }
  ]
};

const pickup: PolicyDocument = {
  title: 'MiseChef Pickup & Order Fulfilment Policy', updated: '28 August 2026',
  intro: <>This Policy explains preparation and self-pickup for orders placed through MiseChef, operated by CL WISE EMPIRE (003882452-K). Please read it together with our Terms & Conditions, Payment Policy and Refund & Cancellation Policy.</>,
  sections: [
    { title: '1. Fulfilment Method', body: <>Unless another fulfilment method is expressly stated at checkout, Orders placed directly through MiseChef are for Self-Pickup. Verify the pickup location, date and time before confirming. Do not rely solely on old screenshots or previous Orders because pickup arrangements may change.</> },
    { title: '2. Preparation Flow', body: <>Preparation generally begins after required payment is successfully confirmed or verified. Order statuses may include Awaiting Payment / Payment Verification → Preparing → Ready for Pickup → Completed. Payment confirmation does not mean the Order is immediately ready; wait for Ready for Pickup unless MiseChef instructs otherwise.</> },
    { title: '3. Pickup Window & Delays', body: <>Collect within the confirmed pickup window. Pickup times are estimates and may be affected by high Order volume, preparation requirements, ingredient availability or operational issues. If there is a significant delay, we will make reasonable efforts to contact you using the information provided with the Order.</> },
    { title: '4. Collection & Pickup Code', body: <>At collection we may ask for an Order Number, Pickup Code, Customer name or telephone number associated with the Order. Check that you receive the correct Order and tell us promptly if anything is missing or incorrect. Keep any Pickup Code reasonably secure and do not publicly share it before collection.</> },
    { title: '5. Collection by Another Person', body: <>Another person may collect on your behalf where reasonably permitted if they have sufficient Order information, such as the Order Number or Pickup Code. We may refuse or delay release if authorisation cannot reasonably be verified. Do not share unnecessary payment or personal information with the collector.</> },
    { title: '6. Late Pickup & Food Quality', body: <>Food and beverages are prepared for collection around the confirmed window. Substantial delays may affect temperature, texture and overall quality, and we may not be able to remake an Order solely because of late collection. Contact us as soon as possible if you expect to be late.</> },
    { title: '7. Failure to Collect', body: <>If correctly prepared food is not collected within a reasonable period, it may be treated as uncollected and handled or disposed of according to food-safety and operational requirements. Perishable food cannot be held indefinitely. An uncollected prepared Order will generally not qualify for a change-of-mind refund.</> },
    { title: '8. After Collection & Food Safety', body: <>Customers are responsible for appropriately transporting, handling and storing Products after collection. Consume, refrigerate or otherwise store Products appropriately. Contact us promptly if you believe there was a significant quality or food-safety issue when the Product was supplied.</> },
    { title: '9. Changes, Unavailability & Group Orders', body: <>Order changes may be possible before preparation starts but cannot be guaranteed afterwards. If a Product or ingredient becomes unavailable, we may agree a substitute, adjust the Order, or cancel and refund the affected Product or Order where appropriate. We will not intentionally substitute a materially different Product without reasonable notice or agreement. Each Group Order remains subject to applicable payment, preparation and pickup requirements.</> },
    contactSection
  ]
};

const contact: PolicyDocument = {
  title: 'Contact MiseChef',
  intro: <>For order enquiries and customer support, please contact MiseChef below. For faster assistance with an existing order, please include your Order Number.</>,
  sections: [
    { title: 'Customer Support', body: <><div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 font-sans text-sm font-bold leading-7 text-on-surface-variant"><a className="inline-flex rounded-full bg-primary px-5 py-3 font-extrabold text-on-primary no-underline" href="https://wa.me/60164209116">WhatsApp Us</a><p className="mt-4">WhatsApp: 016-420 9116</p><p>Email: <a className="text-primary underline" href="mailto:misechef.ai@gmail.com">misechef.ai@gmail.com</a></p></div></> },
    { title: 'Business Information', body: <BusinessIdentity /> },
    { title: 'Security Notice', body: <>MiseChef will NEVER ask for your banking password, banking PIN, payment authentication OTP, or other secret banking credentials. MiseChef may use separate verification codes for account login, registration or identity verification where those features are provided.</> }
  ]
};

const documents: Record<PublicPolicyKey, PolicyDocument> = { terms, privacy, 'refund-cancellation': refund, 'payment-policy': payment, 'pickup-policy': pickup, contact };

export default function PublicPolicyPage({ policy }: { policy: PublicPolicyKey }) {
  const document = documents[policy];
  return (
    <article className="mx-auto max-w-4xl">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Legal & Compliance</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-primary sm:text-5xl">{document.title}</h1>
      {document.updated && <p className="mt-3 font-sans text-xs font-bold text-outline">Last Updated: {document.updated}</p>}
      {document.intro && <div className="mt-7 rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold leading-7 text-on-surface-variant">{document.intro}</div>}
      <div className="mt-8 space-y-8">
        {document.sections.map(section => (
          <section key={section.title}>
            <h2 className="font-display text-2xl font-bold text-primary">{section.title}</h2>
            <div className="mt-3 font-sans text-sm font-bold leading-7 text-on-surface-variant">{section.body}</div>
          </section>
        ))}
      </div>
    </article>
  );
}
