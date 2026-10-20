import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own files so they stay cached between app updates.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "supabase", test: /node_modules[\\/](@supabase|iceberg-js|tslib)[\\/]/ },
          ],
        },
      },
    },
    // The Excel library (~860 kB) is only downloaded when a spreadsheet is made or read.
    chunkSizeWarningLimit: 900,
  },
});
