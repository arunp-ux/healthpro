"use strict";
const panel = document.querySelector("#panel");
const view = document.querySelector("#view");
const key = "kiya-journal-v1";
let journal;
try { journal = JSON.parse(localStorage.getItem(key)) || {}; } catch { journal = {}; }
journal.days ??= {};
const meals = {
  Breakfast: ["Oats & banana bowl", "Rolled oats, sliced banana, almonds and chia seeds."],
  Lunch: ["Lemon rice & chickpeas", "Rice with lemon, cooked chickpeas, cucumber and coriander."],
  Dinner: ["Vegetable dal", "Lentils simmered with seasonal vegetables, served with rice."],
  Snacks: ["Apple & peanut butter", "Apple wedges with a spoonful of peanut butter."]
};
const plans = [["Monthly","₹1,499","month"],["Three months","₹3,999","3 months"],["Yearly","₹11,999","year"]];
const goals = ["General wellness","Regular movement","Meal planning","Hydration","Lifestyle change"];
const stages = ["Warm up with an easy walk","Try a few comfortable chair squats","March gently in place","Finish with an easy stretch"];
let category = "Breakfast";
let feedback = "";
function dateKey() {
  const d = new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function today() {
  return journal.days[dateKey()] ??= {water:0, meals:[], steps:[]};
}
function save(message) {
  try { localStorage.setItem(key, JSON.stringify(journal)); feedback = message; }
  catch { feedback = "Saved for this visit only. Browser storage is unavailable."; }
}
function button(label, action, style="pill", attrs="") {
  return '<button type="button" class="'+style+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
}
function heading(title) { return '<h2 id="panel-title">'+title+'</h2>'; }
function entry(label,value) { return '<div class="entry"><span>'+label+'</span><strong>'+value+'</strong></div>'; }
document.querySelector("#pricing").innerHTML = plans.map(([name,price,period],i)=>'<article><h3>'+name+'</h3><p><strong>'+price+'</strong> / '+period+'</p>'+button("View membership","plan-"+i,"under")+'</article>').join("");
function render(page) {
  const day = today();
  let html = "";
  if (page === "profile") {
    html = heading("Build your routine")+'<form id="profile"><label class="field">First name<input name="name" maxlength="45" autocomplete="given-name" required></label><label class="field">My focus<select name="goal">'+goals.map(g=>'<option>'+g+'</option>').join("")+'</select></label><p class="note">Your journal stays in this browser on this device.</p><button class="solid">Save my routine</button></form>';
  } else if (page === "meal") {
    const [name,ingredients] = meals[category];
    const done = day.meals.includes(category);
    html = heading("Meal planner")+'<div class="row">'+Object.keys(meals).map(c=>button(c,"meal-"+c,"pill",'aria-pressed="'+(c===category)+'"')).join("")+'</div><h3>'+name+'</h3><p>'+ingredients+'</p>'+button(done?"Undo meal log":"Mark meal complete","toggle-meal","solid");
  } else if (page === "water") {
    html = heading("Water tracker")+'<p>Water logged today</p><div class="metric">'+(day.water/1000).toLocaleString()+' L</div><div class="row">'+[250,500,750,1000].map(n=>button("+ "+n+" ml","water-"+n)).join("")+'</div>'+button("Undo last glass","undo-water","under",day.glasses?.length?"":"disabled");
  } else if (page === "move") {
    html = heading("Movement break")+'<img class="move-illustration" src="assets/movement.svg" alt="A yoga mat in a sunlit studio">'+
      '<p>Move at your own pace. Tap each step as you finish.</p>'+stages.map((s,i)=>'<div class="entry"><span>'+s+'</span>'+button(day.steps.includes(i)?"Done":"Log","step-"+i,"pill",'aria-pressed="'+day.steps.includes(i)+'" aria-label="'+s+'"')+'</div>').join("");
  } else if (page.startsWith("plan-")) {
    const i = Number(page.slice(5));
    const [name,price,period] = plans[i];
    html = heading(name+" membership")+'<p class="metric">'+price+'</p><p>Per '+period+' · Personalised meal plan, workout plan and coach support.</p><p class="note">Save this plan to your journal for reference. This preview takes no payment.</p>'+button("Save plan preference","prefer-"+i,"solid");
  } else {
    html = heading("My journal")+'<p id="welcome"></p>'+entry("Meals logged today",day.meals.length)+entry("Movement steps",day.steps.length+" / "+stages.length)+entry("Water today",day.water+" ml")+(plans[journal.plan]?entry("Preferred membership",plans[journal.plan][0]):"")+'<div class="row">'+button("Meals","open-meal")+button("Movement","open-move")+button("Water","open-water")+'</div><h3>Recent progress</h3>'+Object.keys(journal.days).sort().reverse().slice(0,7).map(k=>{const d=journal.days[k];return entry(k,d.meals.length+" meals · "+d.steps.length+" steps · "+d.water+" ml")}).join("")+'<p>'+button("Edit my routine","open-profile","under")+'</p><small>Stored on this device</small>';
  }
  view.innerHTML = html+'<p role="status" class="status note"></p>';
  view.querySelector(".status").textContent = feedback;
  feedback = "";
  if (page === "profile") {
    view.querySelector("[name=name]").value = journal.name || "";
    view.querySelector("[name=goal]").value = journal.goal || goals[0];
  }
  const welcome = view.querySelector("#welcome");
  if (welcome) welcome.textContent = journal.name ? journal.name+" · "+journal.goal : "Your daily check-in";
}
function openPanel(page) {
  render(page);
  if (!panel.open) panel.showModal();
}
document.addEventListener("click", e => {
  const trigger = e.target.closest("[data-open],[data-action]");
  if (!trigger) return;
  if (trigger.dataset.open) return openPanel(trigger.dataset.open);
  const action = trigger.dataset.action;
  const day = today();
  if (action.startsWith("open-")) return render(action.slice(5));
  if (action.startsWith("plan-")) return openPanel(action);
  if (action.startsWith("prefer-")) {
    journal.plan = Number(action.slice(7)); save("Membership preference saved."); return render("journal");
  }
  if (action.startsWith("meal-")) { category = action.slice(5); return render("meal"); }
  if (action === "toggle-meal") {
    day.meals = day.meals.includes(category) ? day.meals.filter(c=>c!==category) : [...day.meals,category];
    save("Meal journal updated."); return render("meal");
  }
  if (action.startsWith("step-")) {
    const i = Number(action.slice(5));
    day.steps = day.steps.includes(i) ? day.steps.filter(s=>s!==i) : [...day.steps,i];
    save("Movement journal updated."); return render("move");
  }
  if (action.startsWith("water-") || action === "undo-water") {
    day.glasses ??= [];
    if (action === "undo-water") day.glasses.pop(); else day.glasses.push(Number(action.slice(6)));
    day.water = day.glasses.reduce((sum,n)=>sum+n,0);
    save("Water journal updated."); render("water");
  }
});
view.addEventListener("submit",e=>{
  e.preventDefault();
  const form=e.target;
  if (!form.name.value.trim()) {form.name.focus();return;}
  journal.name=form.name.value.trim();journal.goal=form.goal.value;
  save("Your routine is saved.");render("journal");
});
document.querySelector("#close").addEventListener("click",()=>panel.close());
panel.addEventListener("click",e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)panel.close();}});
