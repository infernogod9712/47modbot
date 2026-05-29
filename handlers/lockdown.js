let locked = false;
function isLocked() { return locked; }
function setLocked(state) { locked = state; }
module.exports = { isLocked, setLocked };
