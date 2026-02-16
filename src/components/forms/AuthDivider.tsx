"use client";

import { motion } from "framer-motion";

export function AuthDivider() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="relative my-4"
    >
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-black/10" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-4 bg-gray-50 text-black/40">ou</span>
      </div>
    </motion.div>
  );
}
