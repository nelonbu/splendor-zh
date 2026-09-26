import { useGameStore } from '../store/gameStore';
import { AnimatePresence, motion } from 'framer-motion';
import NobleFace from './NobleFace';
import { copy } from '../i18n/zhCN';

export default function NobleRow() {
  const nobles = useGameStore(s => s.board.nobles);
  return (
    <div className="noble-row">
      <h3>{copy.nobles}</h3>
      <AnimatePresence>
        {nobles.map(n => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.3 }}
          >
            <div className="noble-tile"><NobleFace noble={n} /></div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
