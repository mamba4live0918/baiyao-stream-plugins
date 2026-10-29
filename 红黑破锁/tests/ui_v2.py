"""Navigate V2 menu pages before legacy locator operations, retaining real clicks.

This adapter does not alter production state or DOM visibility. LockMenu.reveal
uses the same page navigation and custom popup as the plugin's controls. New V2
menu tests deliberately do not import this module, and exercise triggers directly.
"""
from functools import wraps
from playwright.sync_api import Locator

_visible = Locator.is_visible
_click = Locator.click


def set_range(row, kind, low, high=None):
    """Edit the two real row controls while keeping intermediate ranges valid."""
    high=low if high is None else high
    minimum=row.locator(f'.rule-{kind}-min');maximum=row.locator(f'.rule-{kind}-max')
    try:
        current_high=float(maximum.input_value())
    except ValueError:
        current_high=0
    order=((maximum,high),(minimum,low)) if low>current_high else ((minimum,low),(maximum,high))
    for field,value in order:
        field.fill(str(value));field.dispatch_event('change')


def reveal(locator):
    if locator.count() == 1 and not _visible(locator):
        option = locator.evaluate("""el=>{
          const box=el.closest('.dom-dropdown');
          if(!window.LockMenu||!box||!box.querySelector('.dom-dropdown-list')?.contains(el))return false;
          const section=el.closest('[data-menu-page]');
          if(section?.hidden)LockMenu.activate(section.dataset.menuPage);
          LockMenu.close();return true;
        }""")
        if option:
            # Clicking the real trigger first lets Playwright scroll its anchor
            # into the viewport before production code places the popup.
            trigger=locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," dom-dropdown ")][1]').locator('.dom-dropdown-trigger')
            _click(trigger)
        else:
            locator.evaluate("el=>window.LockMenu?.reveal(el)")


def _prepare(method):
    @wraps(method)
    def prepared(self, *args, **kwargs):
        reveal(self)
        return method(self, *args, **kwargs)
    return prepared


def _semantic_visible(self, *args, **kwargs):
    if self.count() == 1 and not _visible(self):
        # A hidden menu page is navigation state. Hidden conditional fields,
        # cancelled upload previews and closed settings remain real assertions.
        is_page_only = self.evaluate("""el=>{
          const section=el.closest('[data-menu-page]');
          if(!section?.hidden||document.getElementById('settings')?.hidden)return false;
          for(let node=el;node&&node!==section;node=node.parentElement){
            if(node.hidden)return false;
          }
          return true;
        }""")
        if is_page_only:
            self.evaluate("el=>window.LockMenu?.reveal(el)")
    return _visible(self, *args, **kwargs)


def enable():
    if getattr(Locator, '_red_black_v2_navigation', False):
        return
    Locator._red_black_v2_navigation = True
    for name in ('click', 'dblclick', 'fill', 'set_input_files', 'check', 'uncheck',
                 'set_checked', 'scroll_into_view_if_needed'):
        setattr(Locator, name, _prepare(getattr(Locator, name)))
    Locator.is_visible = _semantic_visible


enable()
