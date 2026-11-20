ARG BASE_IMAGE
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jre-headless iproute2 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY integration /app/integration
COPY rollback /app/rollback
COPY *-manifest.json /app/
COPY harness /app/harness
RUN cd /app/integration && npm ci --ignore-scripts && npm rebuild esbuild && cd functions && npm ci --ignore-scripts
RUN mkdir /opt/qa-tools && cd /opt/qa-tools && npm init -y && npm install --save-exact firebase-tools@14.22.0 playwright@1.56.1
RUN ln -s /app/integration/node_modules /app/node_modules && ln -s /app/integration/node_modules /app/rollback/node_modules && ln -s /app/integration/functions/node_modules /app/rollback/functions/node_modules
ENV FIREBASE_EMULATORS_PATH=/opt/emulators CI=true
RUN /opt/qa-tools/node_modules/.bin/firebase setup:emulators:firestore && /opt/qa-tools/node_modules/.bin/firebase setup:emulators:storage
RUN for label in integration rollback; do printf 'GEMINI_API_KEY=dummy-local-only\nSTRIPE_SECRET_KEY=dummy-local-only\nSTRIPE_WEBHOOK_SECRET=dummy-local-only\nLALAMOVE_API_KEY=dummy-local-only\nLALAMOVE_API_SECRET=dummy-local-only\nCURLEC_KEY_ID=dummy-local-only\nCURLEC_KEY_SECRET=dummy-local-only\nCURLEC_WEBHOOK_SECRET=dummy-local-only\nUSDA_FDC_API_KEY=dummy-local-only\n' > /app/$label/functions/.secret.local; printf 'SELLING_WORKSPACE_ID=qa-store\nPUBLIC_SITE_ORIGIN=http://127.0.0.1:4173\nCURLEC_PAYMENT_LINK_ROLLOUT_ENABLED=false\n' > /app/$label/functions/.env.local; done
RUN rm -rf /root/.config /root/.cache /root/.ssh /root/.aws /root/.npmrc
CMD ["node","/app/harness/run.mjs"]
