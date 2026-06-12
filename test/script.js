function navigate(view) {
    document.getElementById('dashboard').style.display = view === 'dashboard' ? 'block' : 'none';
    document.getElementById('editor').style.display = view === 'editor' ? 'block' : 'none';
}

function simulateSwarmAction() {
    const logList = document.getElementById('log-list');
    const updateLog = (msg) => {
        const li = document.createElement('li');
        li.textContent = msg;
        logList.prepend(li);
    };

    updateLog("Orchestrator: Initiating collaborative fix...");
    document.querySelector('#agent-orchestrator .status').textContent = 'Busy';

    setTimeout(() => {
        updateLog("Coder: Modifying App.tsx to address vulnerability...");
        document.querySelector('#agent-coder .status').textContent = 'Busy';
    }, 1000);

    setTimeout(() => {
        updateLog("Auditor: Validating changes in App.tsx...");
        document.querySelector('#agent-auditor .status').textContent = 'Busy';
    }, 2000);

    setTimeout(() => {
        updateLog("Orchestrator: Fix applied successfully.");
        document.querySelectorAll('.status').forEach(s => s.textContent = 'Idle');
    }, 3000);
}
