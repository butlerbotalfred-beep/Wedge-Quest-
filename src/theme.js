// Shared look-and-feel data: topic colours, avatars, topic ideas.
(function (root) {
  'use strict';

  // Ordered so neighbouring topics on the board contrast strongly.
  const PALETTE = ['#ff39c4', '#12c8ff', '#ffc21a', '#a64bff', '#7df02a', '#ff8a1f', '#3b82ff', '#22ffb5'];

  const AVATARS = ['🦊', '🐼', '🐯', '🦄', '🐲', '🚀', '🤖', '🐸', '🦁', '🐧', '👾', '🦖'];
  const PLAYER_COLORS = ['#ff9a1f', '#2fd4ff', '#9dff2e', '#ff4fb0', '#b57cff', '#ffd21f'];

  const TOPIC_IDEAS = [
    { name: 'Science', emoji: '🔬' },
    { name: 'Animals', emoji: '🦁' },
    { name: 'Space', emoji: '🚀' },
    { name: 'Geography', emoji: '🌍' },
    { name: 'History', emoji: '🏛️' },
    { name: 'Math', emoji: '➗' },
    { name: 'Sports', emoji: '⚽' },
    { name: 'Food', emoji: '🍕' },
    { name: 'Music', emoji: '🎵' },
    { name: 'Movies', emoji: '🎬' },
    { name: 'Video Games', emoji: '🎮' },
    { name: 'Dinosaurs', emoji: '🦖' },
    { name: 'Oceans', emoji: '🐙' },
    { name: 'Human Body', emoji: '🧠' },
    { name: 'Technology', emoji: '💻' },
    { name: 'Art', emoji: '🎨' },
    { name: 'Books', emoji: '📚' },
    { name: 'Nature', emoji: '🌳' },
    { name: 'Inventions', emoji: '💡' },
    { name: 'Weather', emoji: '⛈️' },
    { name: 'Mythology', emoji: '🐉' },
    { name: 'Cars', emoji: '🚗' },
    { name: 'Pirates', emoji: '🏴‍☠️' },
    { name: 'Robots', emoji: '🤖' },
  ];

  const DEFAULT_TOPICS = ['Science', 'Animals', 'Space', 'Geography', 'History', 'Math', 'Sports', 'Food'];

  const EMOJI_CHOICES = ('🔬 🧪 🧬 🦁 🐾 🐶 🐱 🐙 🦈 🦖 🚀 🪐 🌍 🗺️ 🏛️ 🏺 ⚔️ 🏰 ➗ 🔢 📐 ⚽ 🏀 🏈 🎾 🏊 🍕 🍔 🍎 🍩 🎵 🎸 🎬 🎮 💻 🤖 🎨 📚 ✏️ 🌳 🌋 ⛈️ 💡 🔧 🚗 ✈️ 🚂 🏴‍☠️ 👑 🧙 🐉 🧠 🦴 🔭 🎭').split(' ');

  const api = { PALETTE, AVATARS, PLAYER_COLORS, TOPIC_IDEAS, DEFAULT_TOPICS, EMOJI_CHOICES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WQTheme = api;
})(typeof window !== 'undefined' ? window : globalThis);
