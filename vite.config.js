import { defineConfig } from 'vite';
export default defineConfig({server:{proxy:{'/api':'http://localhost:3001','/assets-data':'http://localhost:3001'}}});
