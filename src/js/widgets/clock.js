/* ============================================================
 * 时钟组件：占 2 格，实时显示时间与日期
 * ============================================================ */

WidgetRegistry.register({
  type: 'clock',
  name: '时钟',
  desc: '实时显示当前时间与日期，占 2 格',
  icon:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.4V12l3.2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  span: 2,

  mount(el, ctx) {
    el.classList.add('tile-clock');
    el.innerHTML =
      '<div class="clock-face">' +
        '<div class="clock-time">--:--</div>' +
        '<div class="clock-date"></div>' +
      '</div>';

    const timeNode = el.querySelector('.clock-time');
    const dateNode = el.querySelector('.clock-date');
    const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      timeNode.textContent = hh + ':' + mm;
      timeNode.title = hh + ':' + mm + ':' + ss;
      dateNode.textContent =
        now.getMonth() + 1 + '月' + now.getDate() + '日 ' + WEEK[now.getDay()];
    }

    tick();
    const timer = setInterval(tick, 1000);
    ctx.onDispose(() => clearInterval(timer));
  }
});
