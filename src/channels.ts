// 수집 대상 채널 (owner = members.ts slug, 'stellive' = 공식 그룹 채널)
// YouTube 채널 ID는 youtube.ts 실행 시 channels.list 응답 제목으로 검증됨
export interface ChannelSource {
  owner: string;
  youtube: string[]; // 메인 → 서브 순
  chzzk?: string;
}

export const CHANNELS: ChannelSource[] = [
  { owner: 'stellive', youtube: ['UC2b4WRE5BZ6SIUWBeJU8rwg', 'UCbiWR9pa5YTRknGPzn0l8Ww'] },
  { owner: 'kanna', youtube: ['UCKzfyYWHQ92z_2jUcSABM8Q', 'UC6YnTqZidFg4WUiXpiCtSSQ'], chzzk: 'f722959d1b8e651bd56209b343932c01' },
  { owner: 'yuni', youtube: ['UClbYIn9LDbbFZ9w2shX3K0g', 'UCV4WeySMDmS1CoTypSJoQmg'], chzzk: '45e71a76e949e16a34764deb962f9d9f' },
  { owner: 'huya', youtube: ['UC0YQnenKBCu5sGb7H61n6HA'], chzzk: '36ddb9bb4f17593b60f1b63cec86611d' },
  { owner: 'hina', youtube: ['UC1afpiIuBDcjYlmruAa0HiA'], chzzk: 'b044e3a3b9259246bc92e863e7d3f3b8' },
  { owner: 'mashiro', youtube: ['UC_eeSpMBz8PG4ssdBPnP07g'], chzzk: '4515b179f86b67b4981e16190817c580' },
  { owner: 'lize', youtube: ['UC7-m6jQLinZQWIbwm9W-1iw'], chzzk: '4325b1d5bbc321fad3042306646e2e50' },
  { owner: 'tabi', youtube: ['UCAHVQ44O81aehLWfy9O6Elw'], chzzk: 'a6c4ddb09cdb160478996007bff35296' },
  { owner: 'shibuki', youtube: ['UCYxLMfeX1CbMBll9MsGlzmw'], chzzk: '64d76089fba26b180d9c9e48a32600d9' },
  { owner: 'rin', youtube: ['UCQmcltnre6aG9SkDRYZqFIg'], chzzk: '516937b5f85cbf2249ce31b0ad046b0f' },
  { owner: 'nana', youtube: ['UCcA21_PzN1EhNe7xS4MJGsQ'], chzzk: '4d812b586ff63f8a2946e64fa860bbf5' },
  { owner: 'riko', youtube: ['UCj0c1jUr91dTetIQP2pFeLA'], chzzk: '8fd39bb8de623317de90654718638b10' },
  { owner: 'toa', youtube: ['UClcSEuDF_g_6g4snw_nAavw'], chzzk: '2299fad4bebb504b0978e1ec08b2f7d3' },
  { owner: 'rang', youtube: ['UCQ6LlsI7Bbj2yhSqLMI1gGA'], chzzk: 'c657aa3592260a2b59669a72ec151936' },
  { owner: 'hiyori', youtube: ['UCHAr9pWGS30akL4MQCQT4uQ'], chzzk: '49d2c3cf8f0b2843d934ec15e82bb54c' },
  { owner: 'mary', youtube: ['UCGSt1yNG5l-jpYRLpJ5oNtA'], chzzk: '792acf9ca28b42918710327e14b06b68' },
];
