import os from 'node:os';
const original = os.userInfo;
os.userInfo = (...args) => { try { return original(...args); } catch(error) { if(error.code !== 'ERR_SYSTEM_ERROR') throw error; return { username: process.env.USERNAME || 'garus', homedir: process.env.USERPROFILE, uid: -1, gid: -1, shell: null }; } };
