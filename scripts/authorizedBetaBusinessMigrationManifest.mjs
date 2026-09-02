export const MIGRATION_VERSION = 'authorized-beta-business-v1';

export const SOURCE = Object.freeze({
  projectId: 'misechef-beta-fa4bf',
  bucket: 'misechef-beta-fa4bf.firebasestorage.app',
  ownerUid: '6yGWqlSgt2UePe1F4xFGf3bBTj73',
  workspaceId: 'n7zlkIAtOogOuRX4AZ3QFKRHKI02',
  otherRecipeAuthorUid: 'R7LLsgfxYzbuYFDI77gDSkrIBTd2'
});

export const DESTINATION = Object.freeze({
  projectId: 'misechef-fa4bf',
  bucket: 'misechef-fa4bf.firebasestorage.app',
  ownerUid: 'stShXwdbIzOh14ItTtQ4hRB5oBz1',
  workspaceId: 'stShXwdbIzOh14ItTtQ4hRB5oBz1'
});

const ids = value => value.trim().split(/\s+/).filter(Boolean);

export const FIRESTORE_ALLOWLIST = Object.freeze({
  recipes: ids(`
    recipe_1787310869844 recipe_1787312951630 recipe_1787313375498
    recipe_1787375085478 recipe_1787376157322 recipe_1787376569895
    recipe_1787376839753 recipe_1787466266772 recipe_1787471535476
    recipe_1787471995406 recipe_1787472806063 recipe_1787570232763
    recipe_1787643192786 recipe_1787645372214 recipe_1787646116740
    recipe_1787646510703 recipe_1787653936315 recipe_1787658452072
    recipe_1787735470895 recipe_1787735886852
  `),
  categories: ids(`
    cat_1787313014879_jl36x3 cat_1787466019838_u3xzy5
    cat_1787634354975_bjyapn cat_1787643397310_g19ptt
    cat_1787821984520_hhiakn cat_1787889904525_06tt6i
  `),
  ingredients: ids(`
    0jMSU5OUKskssoLUDC1f 17v7TgPq00FPX7vZgb8e 1MLcq62MZTV8AU1hOBQq
    2n01TBu4cTpxFZz5DD1c 2wKxYVU5vFsIe2BrCrNs 3QRx6hD9rlTHhochrnHl
    3dxpYkjXxzduy7QqiZBm 3n0FHU2FeyoRHwcVTgaR 50UxdW29HbpQs1kj8rrV
    5bDaN59XNRWqMVx9ygT2 6DQlIv9yST2j4lMU7XO1 7dlLZoAOQURGANxWj24M
    82pQdgx7Tw5j3tLa44CH AsQ5pCFHV8WrRl1qZzVy B4Qy4BAl1YxXc1NUtcQB
    BgSfPPtOcbglulpNbsMm DSi7jCHaqLVQoljMhcj0 Dkb3GdYnFZ4npYmWOiCc
    DyJtSe7YLucY45mer71w E56EzTucHsn8CAa9ttOT E8fdfOTmMzoylHRtiK3Y
    EdhILZuoXQT9C0Fnl9e5 EtelFt9o976bEQy1YULN FD0TGfW7az4CIlKQMnGO
    FzdpQoHBJbx7PJTYCaDL GtAQvxkDuwp3PHpyMdEs HhmGS0ZlXBtGPLURnNfS
    IDU16EbYjfFMCTCso4i6 JR2ZZ13pmSj0HduHUHUB JpZrk2Uw3ibAHFlDKy8m
    Jqy9gdiAN8GwJ6r3NtbT KA90zjVpkH8oE84dDoxU KayyrB285WPkLP9GU2xY
    LSPnfPjtimQZE4ek2jD6 M0GExNsINGZoIUcxhzh5 MMC5WJOgrRJ7VH3ybnNW
    MiZurAt0dpcG5K3nRLSS NrciLz1YpSJRmrcdi7Bj OEgPSr54Yvt5rIvtkp8k
    OU1yI6JBzA1JD9yYI0d9 PZqMbXNS7hDNZNKD9eIq PipARQBufJKhOrl76W6A
    Pk0Bxg8T8lhOtsh1oTni Q2u0m6fHX9jNt3JdBAMs RMXcvEyyUyC9ca0xBjf5
    ROvsDeaRwGI62kZlUJfl RVkBye0DENZzklCsuwNh Rx9tfbqKxau7UrT9oSVj
    S62jHWx4BRGFKB0hHLqv TTuIun5lcaiDg9wT6Sfu UZeYadsapSRr9tnNNZlM
    VWvydGgRAIAhuUUnKyG8 W3LhVwziixySuR4yeLW4 WN99tfjV0IKFdGhsH5UL
    XEVMWUDKjLxe9i8b4tZ9 YFxkWwCv1sN1qx52haVd Ysq6fYZEtFQYDYPPO642
    a2SzRsGvR08S7ab1DVqP a8yVMPiqWzFXqzpTXxw9 aS1clUPu8ZUnEMiMV7OG
    asQ1D0pqYkha9t2X03BA bAtFJ8o5lUeMBpZEcokk dn1MC9z8dR1RptF1uUQ0
    eJVi3gJTkD4tiaPTpwh5 en67b6HxhrMd8ImNnsFN exsWu7f1qkdBN3ZJgKCm
    f3IrzeR5Qc6XZDeKGkit gSqSKUmcX4Oj8xp7lCof gkvFPOAvkctilYqWcSzs
    h0NTHdMChfstcI2zPYKV iJYchYDcJbSkKO213EYg jlfkmrScFilViGthXSEv
    lN2zkoxps3Nd8oyWjW02 n06ylvW4I33Vwi6H2Yet nFEX11dcQtSkKVFLIpzD
    nOvosluJG21QsUmla6cH nx9EMMn0NGDe0ItMhXwJ oZnXsXhja1Gj2Tlu3jJ1
    pme1rhHfbfowSo26vlkt qqytmcQQaeCdEMXbw2Qd rxFcSHF18ky2aDmREHYc
    s3q0tyG5DLhc4DR0N2q1 sxc5MRjX961f8mRZQrgv t2LQlaK1mjhfzHjPHUmk
    vBUVMIWG0kajt580iy1I vvh7JWPm6caQQIU3RV01 w8ZivuW3gFWKrAl9IDiH
    yLDbFBwnqLXJvhkLZWXI ySgvGzOlqDYoMZ7VozNC
  `),
  ingredientPriceHistory: ids(`
    0fWGiCzEoU9RwKiud6Km 154aYv0cDqQ6jNhJg39y 1ubXzSN58iZ4UkL6MRZ1
    32pVUyCVaN8lDSS5t6pp 3nfLgMwib83AAV8sYoN8 4zxo5Z43uQzZWWwGbPEt
    5KYHUU1IVxxW9ZHPatgi 6Lhokc6M9kPT93QswHs0 7MQQ3BbIBI8yxfMGznFU
    7T7nCCP3seFTw4Cskeal 8B8mZKKodTen2il6JtXA 8i0kJBMWHroxfqyfUys5
    9aC2AyTMsElnJdzX90TT A6IZW9qh2LCtMzMfTUCw CTM8NvKEzJbeBYX0EtUx
    D06Ox18Up4oh365e0QD1 ET2RiRsLeftm31b1u5SC EfQlgOLAi2t8o6QvAcoD
    F4Y4aNTCnSs3NlTJe1qx FO2SwliVj9PVT45GaHdl FafNkbzHXsgN03Sav1tS
    FjFFVZLFEEN4hT4oXG9h Gp6EMFWKT2dgcDoolAXD HXVWi4v50AjTZsQENcsu
    HjGWniaETs0s8hug5sEZ I2KwBHdYaReccT0jV70U IWYoffxqkNEaLldF10qU
    KGnBPdto3ff4j9it6Pb8 LGMIrJ78pzLEYfjrSXAy LLQEXp9Ygw1MJP0DZdXx
    Ne332R6FT3ugSpHbiooz PXTJ2f0HqMJ6fI2Iussz ROwrXbHtxC64Qru6Ra69
    Ro97oTuaj3OhfBXY3Jnj SM4To8UuLN88Cu88lMxY SUMrM3U6aucnN31j9Bpj
    VxeUIhqiAUEbsJYC9oC5 WGpKBUCcWu9qjFw8iNcK X2oK75GCnaYsqDZUhMVK
    YAJwsDPst5OUYiu1DaSx ZXM96nLDwwPsVeFvuTSD Zu9tAcWaWfjQsQlyU2Px
    abECPcattnMSByDGHt6X bKSU5dKKjA6fHDv6Tuk3 cPYFQbEDvFfKoRDJmofT
    eSq8usqiarLn4O8MzoaJ f5y5v6iXCTkLn7zPqNfE fvjVajoSIDAu6opg8RRu
    g2NwgZLe9l472XSLZQIW gKS1A2FBM6NbMMYr8FOY h4f3GbSzxJbb4PHfqs8n
    hfhV7d6fnp0KnkeMqBD1 n0kqSUPOKBAfArtDxGqN nhC6t12ksKsk8XUuwLw2
    noazhkLFNOrI7W95XuyH oByHTJJbDrl64kwh7hif sxltBmx7WQQg95zpx68m
    t1dUHYYlZoYw1g7IiCO2 t5HJ506yC7jcQf1hkTEv tdNEBdLSOWNAsqz48jJn
    wMcghF2C4CluBeLpvw4Q wRkqnf6vomVklq9hMweo
  `),
  invoices: ids(`
    391LsFlYNm9ljJdYKBP1 4phMm3rYXQJaGa8miRAo 5rJEyMxO0VhLfgu3Lqh2
    7WoxMQEKxYiclmRmfFyP HrkE4uh2OqpPOaXKFshq NWQWiRxGWdi6o4mCYE8i
    PjJj6hq4FIlKVtBlef5B hNWUH9ZUPCbwZn8Ohm1G oONUhRI3ePV4uLnNxnqf
    rFmPhjSXFZWBGhKeIG0q sxP3IQEXvoHuQt8pR6P1 vaOqN76ojkzzncREnJMz
  `),
  stores: [SOURCE.workspaceId],
  storeSlugs: ['misechef-s-grab-go-store'],
  storeProducts: ids(`
    3I9ULaUuMLz4Xc1YAYfx 4UgQ7qHDHAaKGz88fGgT A4I6ndOfjPT3HC5Tie4M
    BjdAGwE8Z6g5nxv21gNH DMBw9VRrnRgW3nomSSQx Ib7P7RqPQDolgxsYtsIR
    J4TXNwqBm4WwfXSVkTEQ NEFCNFyhdw7TrNm4GsXd NjTZyXDbZlbi3CJbiean
    XR6BLMU2re862p3kSpT8 YO4tnhuw5Rtt7WrWtGjy bXuaMOUxbVvj7oT6XHNd
    fDMoLhOpROihFPLsLtZR rrmD8UYBXoxTYD8aW1jk
  `),
  storeSets: ids(`
    5x02pyEmbng5F6C3vgYk UXmceW3xn3gHAnGwy2s1
    Y2h4zSCCOZRK2eQbGLUF kp62IfN7HtJTZC1VNzFd
  `),
  hostProfiles: [SOURCE.ownerUid]
});

export const DESTINATION_ID_OVERRIDES = Object.freeze({
  [`stores/${SOURCE.workspaceId}`]: `stores/${DESTINATION.workspaceId}`,
  [`hostProfiles/${SOURCE.ownerUid}`]: `hostProfiles/${DESTINATION.ownerUid}`
});

const storage = (sourcePath, size, md5Hash, destinationPath) => ({
  sourcePath,
  destinationPath: destinationPath || sourcePath
    .replaceAll(SOURCE.ownerUid, DESTINATION.ownerUid)
    .replaceAll(SOURCE.workspaceId, DESTINATION.workspaceId),
  size,
  md5Hash
});

export const STORAGE_ALLOWLIST = Object.freeze([
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787312951630/cover.jpg', 140511, 'UwyCxoT7GdVKajCW0Jbl0A=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787313375498/cover.jpg', 153872, 'i8scuVzQb5wfU2TMCtRXfQ=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787376157322/cover.jpg', 131662, 'OxbnLnJQ0pO6R1k0Ro/5Bg=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787376569895/cover.jpg', 138543, 'UC1jnT/Q9zxkVRB/eEyq/Q=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787376839753/cover.jpg', 98061, 'oqFTetoCMuHKip7L+Sq3VA=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787466266772/cover.jpg', 126157, 'Fi8CKtQJkYdOzP+ie3/EEg=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787570232763/cover.jpg', 189172, 'WFXaPtt0c/dHPoT+ngkfnA=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787646116740/cover.jpg', 154936, 'nTWRU9GWgGDZztlE2yfneg=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787646510703/cover.jpg', 152520, 'WPMv3TsQGTd3msUpBtIfog=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787653936315/cover.jpg', 130808, 'AMagLRsTz3T4fcvnOGfa7Q=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787658452072/cover.jpg', 115806, '8xHn9UJsVEom1NT7PbE2Jw=='),
  storage('recipes/6yGWqlSgt2UePe1F4xFGf3bBTj73/recipe_1787735470895/cover.jpg', 152949, 'uOSQNY34VP72ra9lR4dXjg=='),
  storage('recipes/n7zlkIAtOogOuRX4AZ3QFKRHKI02/recipe_1787471535476/cover.jpg', 152983, 'U4KQwTeiv4hK5JZGCX60xA=='),
  storage('recipes/n7zlkIAtOogOuRX4AZ3QFKRHKI02/recipe_1787471995406/cover.jpg', 151207, 'e/62x/iy8KjDDVl787xNrw=='),
  storage('recipes/n7zlkIAtOogOuRX4AZ3QFKRHKI02/recipe_1787472806063/cover.jpg', 139568, 'JRTad8/mzn/j7VfM1wOAjA=='),
  storage('stores/n7zlkIAtOogOuRX4AZ3QFKRHKI02/branding/cover.png', 859161, 'DxM1cGgNOprr/NCOHfp4zQ=='),
  storage('stores/n7zlkIAtOogOuRX4AZ3QFKRHKI02/branding/logo.png', 465114, '0qFhnmKH4G2NelrvQFyCvQ=='),
  storage('stores/n7zlkIAtOogOuRX4AZ3QFKRHKI02/payment-methods/touch_n_go_qr/merchant-qr.jpg', 162275, 'TjOI0PNiESrjvc/3Phk93g=='),
  ...[
    ['3I9ULaUuMLz4Xc1YAYfx', 'photo.png', 2539202, 'i+GIsrs9UmD4lXuD/DBcaA=='],
    ['4UgQ7qHDHAaKGz88fGgT', 'photo.png', 2457472, 'WhgF9OzHuYAUVv+nq+StaQ=='],
    ['A4I6ndOfjPT3HC5Tie4M', 'photo.png', 2631467, 'zJNd28ico6LiWpGhisdwkA=='],
    ['BjdAGwE8Z6g5nxv21gNH', 'photo.png', 2311541, 'UXeUsf5Em4KKaAC9R9bdwg=='],
    ['DMBw9VRrnRgW3nomSSQx', 'photo.png', 2288388, '3Lpsv6Ye2x/VBPgSN9fVAg=='],
    ['Ib7P7RqPQDolgxsYtsIR', 'photo.png', 2276727, 'CxyvN2BsKbqX5O8b07isVQ=='],
    ['J4TXNwqBm4WwfXSVkTEQ', 'photo.png', 2511404, '4Een6n2KtWF0qo0fZIfSRQ=='],
    ['NEFCNFyhdw7TrNm4GsXd', 'photo.png', 2300549, 'h1MDHJGdtMQ1RmSmMoUmFA=='],
    ['NjTZyXDbZlbi3CJbiean', 'photo.png', 2608051, 'dJu8uXSzUc0XLMC2Ggr+3A=='],
    ['XR6BLMU2re862p3kSpT8', 'photo.png', 2364543, 'K3RgKRbB6Yle69HEHmKn4Q=='],
    ['YO4tnhuw5Rtt7WrWtGjy', 'photo.jpg', 217970, 'oQKdqf24E2t3CLyPsrWBWw=='],
    ['bXuaMOUxbVvj7oT6XHNd', 'photo.png', 2434665, 'ePiZ6OoJk17dqvvFwy4Vbw=='],
    ['fDMoLhOpROihFPLsLtZR', 'photo.png', 2360967, 'D3+icVmC8R2F/QnM1b8T/g=='],
    ['rrmD8UYBXoxTYD8aW1jk', 'photo.png', 2463418, 'pBb8t7sbTqpggw+3KZj2sw==']
  ].map(([id, name, size, hash]) => storage(`stores/${SOURCE.workspaceId}/products/${id}/${name}`, size, hash)),
  ...[
    ['5x02pyEmbng5F6C3vgYk', 2411721, 'QDYoGZGGvwSVhdqd9F+RSQ=='],
    ['UXmceW3xn3gHAnGwy2s1', 1999207, 'SDQ/EWyL22ex9NFA1rJeKw=='],
    ['Y2h4zSCCOZRK2eQbGLUF', 2718085, 'ZPmeEVGC+WUezD32bUUATg=='],
    ['kp62IfN7HtJTZC1VNzFd', 2579041, 'Xe0lrw1DnXRp4mMqI18asg==']
  ].map(([id, size, hash]) => storage(`stores/${SOURCE.workspaceId}/sets/${id}/image.png`, size, hash)),
  storage(`users/${SOURCE.ownerUid}/chef-profile/resume-imports/7028127b-db54-4223-b2ec-5b54d459fb42-CELIM_RESUME___1_.pdf`, 142229, 'wLGOEGPUP9MKcG9Vakbc9w==', `users/${DESTINATION.ownerUid}/chef-profile/resume-imports/fb02a9e4-6e9c-4975-8f16-d38b527bcdae-CELIM_RESUME___1_.pdf`),
  ...[
    [SOURCE.ownerUid, '391LsFlYNm9ljJdYKBP1', 'image.jpg', 2893547, 'KFjmzC74n4F1i/i1RDZp/g=='],
    [SOURCE.ownerUid, '5rJEyMxO0VhLfgu3Lqh2', 'image.jpg', 2669541, 'DkawJz00xVwFrNcF0jDEIg=='],
    [SOURCE.ownerUid, 'HrkE4uh2OqpPOaXKFshq', 'image.jpg', 2960016, 'cSSUJZUPoSifDnbgyU7zvA=='],
    [SOURCE.ownerUid, 'PjJj6hq4FIlKVtBlef5B', 'image.jpg', 3203655, 'tV8lC4qUppJlHGvSnsn9eQ=='],
    [SOURCE.ownerUid, 'oONUhRI3ePV4uLnNxnqf', 'image.jpg', 2849987, '3kIhdLTPi43cPeMB3EbJdA=='],
    [SOURCE.ownerUid, 'rFmPhjSXFZWBGhKeIG0q', 'image.jpg', 2829020, 'hp9fa2cWK6WqL3kQ2zcUJg=='],
    [SOURCE.ownerUid, 'sxP3IQEXvoHuQt8pR6P1', 'JPEG_image.jpeg', 598366, 'cCJ1rUU99fCQQiWHdIwjSg=='],
    [SOURCE.workspaceId, '4phMm3rYXQJaGa8miRAo', 'image.jpg', 1920297, '2+0DuAlRfcEwqDd1ONvRZw=='],
    [SOURCE.workspaceId, '7WoxMQEKxYiclmRmfFyP', 'image.jpg', 3010752, 'dHsmD3nF5iyX2u4CQ3vRig=='],
    [SOURCE.workspaceId, 'NWQWiRxGWdi6o4mCYE8i', 'image.jpg', 3085814, 'dJpWo7JrdlSN3Ub+B3T9ew=='],
    [SOURCE.workspaceId, 'hNWUH9ZUPCbwZn8Ohm1G', 'image.jpg', 3254736, 'wO8kXxu7Gtnn3V69uop3qQ=='],
    [SOURCE.workspaceId, 'vaOqN76ojkzzncREnJMz', 'image.jpg', 3180266, '1C3xr3YPW0YyyjYs87cd2A==']
  ].map(([uid, id, name, size, hash]) => storage(`users/${uid}/costing/invoices/${id}/${name}`, size, hash))
]);

export const EXCLUDED_COLLECTIONS = Object.freeze([
  'groupOrders', 'storeOrders', 'storeOrderTimeline', 'storeNotifications',
  'hostRewardLedger', 'resumeImportJobs', 'aiRequestLogs', 'ai_usage',
  'audit_logs', 'invoiceAuditLogs', 'teamAuditLogs', 'teamInvitations',
  'subscriptionUsage', 'subscriptionQuotaLocks', 'publicRecipes',
  'publicRecipeAssetManifests', 'publicChefProfiles',
  'publicChefProfileOwnership', 'publicChefProfileManifests'
]);

export const EXCLUDED_STORAGE_PREFIXES = Object.freeze([
  `store-payment-receipts/${SOURCE.workspaceId}/`,
  'public-recipe-assets/'
]);

export const EXPECTED_COUNTS = Object.freeze({
  firestoreSource: 210,
  firestoreCreates: 209,
  firestoreUpdates: 1,
  storageSource: 49,
  storageCreates: 48,
  storageIdenticalExisting: 1,
  trustedPublicRecipeRegenerations: 3
});

export const PUBLIC_RECIPE_IDS = Object.freeze([
  'recipe_1787376157322',
  'recipe_1787570232763',
  'recipe_1787658452072'
]);

export const PUBLIC_RECIPE_ASSET_PATHS = Object.freeze([
  'public-recipe-assets/de676e2755a4cfdcc93c6a24c359ccb0/cover',
  'public-recipe-assets/1c4bf7265ac1e9e99c19a9196f5dabff/cover',
  'public-recipe-assets/2e70a28f22c951af232255f5f1bca669/cover'
]);
