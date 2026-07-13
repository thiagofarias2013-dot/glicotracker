document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registro-form');
    const historicoList = document.getElementById('historico');
    
    // Agora o banco de dados é a memória do próprio navegador!
    let registros = JSON.parse(localStorage.getItem('glicoTrackerDB')) || [];
    let graficoInstancia = null;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.error('Erro no SW:', err));
    }

    // --- FUNÇÕES DE BANCO DE DADOS LOCAL ---
    function salvarNoBancoLocal() {
        localStorage.setItem('glicoTrackerDB', JSON.stringify(registros));
    }

    function classificarGlicemia(valor) {
        if (valor < 70) return 'status-perigo';
        if (valor <= 100) return 'status-normal';
        if (valor <= 125) return 'status-alerta';
        return 'status-perigo';
    }

    function formatarPeriodo(periodo) {
        const mapa = { manha: 'MANHÃ', tarde: 'TARDE', noite: 'NOITE' };
        return mapa[periodo] || periodo.toUpperCase();
    }

    function preencherDataHoraAtuais() {
        const agora = new Date();
        
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        const elementoData = document.getElementById('data');
        if (elementoData) elementoData.value = `${ano}-${mes}-${dia}`;
        
        const horas = String(agora.getHours()).padStart(2, '0');
        const minutos = String(agora.getMinutes()).padStart(2, '0');
        const elementoHora = document.getElementById('hora');
        if (elementoHora) elementoHora.value = `${horas}:${minutos}`;
    }

    function obterRegistrosFiltrados() {
        const filtroPeriodo = document.getElementById('filtro-periodo').value;
        const filtroData = document.getElementById('filtro-data').value;
        
        let filtrados = [...registros].reverse();
        
        // Aplica filtro de Período
        if (filtroPeriodo !== 'todos') {
            filtrados = filtrados.filter(r => r.periodo === filtroPeriodo);
        }
        
        // Aplica filtro de Data
        if (filtroData !== 'todos') {
            const diasLimite = parseInt(filtroData);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            filtrados = filtrados.filter(r => {
                const partes = r.data.split('/');
                const dataReg = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00`);
                const diffTempo = hoje.getTime() - dataReg.getTime();
                const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24));
                
                // Agora o limite será o valor selecionado (7, 30 ou 365)
                return diffDias <= diasLimite;
            });
        }
        
        return filtrados;
    }

    const faixaSegurancaPlugin = {
        id: 'faixaSeguranca',
        beforeDraw: (chart) => {
            const {ctx, chartArea, scales: {y}} = chart;
            if (!chartArea) return;
            
            ctx.save();
            const y100 = y.getPixelForValue(100);
            const y70 = y.getPixelForValue(70);
            
            ctx.fillStyle = 'rgba(22, 163, 74, 0.1)'; 
            ctx.fillRect(chartArea.left, y100, chartArea.right - chartArea.left, y70 - y100);
            ctx.restore();
        }
    };

    function renderizarGrafico(dadosFiltrados) {
        const canvas = document.getElementById('graficoGlicemia');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');

        const dadosGrafico = [...dadosFiltrados].reverse(); 
        const labels = dadosGrafico.map(r => `${r.data.substring(0,5)} ${r.hora}`);
        const valores = dadosGrafico.map(r => r.valor);

        if (graficoInstancia) {
            graficoInstancia.destroy();
        }

        graficoInstancia = new Chart(ctx, {
            type: 'line',
            plugins: [faixaSegurancaPlugin], 
            data: {
                labels: labels,
                datasets: [{
                    label: 'Glicemia (mg/dL)',
                    data: valores,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#1d4ed8',
                    pointRadius: 4,
                    fill: false, 
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: false,
                        suggestedMin: 50,
                        suggestedMax: 180
                    }
                }
            }
        });
    }

    function atualizarDashboard() {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const registrosHoje = registros.filter(r => r.data === hoje);

        const medias = { manha: [], tarde: [], noite: [] };
        registrosHoje.forEach(r => medias[r.periodo].push(r.valor));

        ['manha', 'tarde', 'noite'].forEach(periodo => {
            const valores = medias[periodo];
            const media = valores.length 
                ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(0) 
                : '--';
            
            const elementoMedia = document.getElementById(`media-${periodo}`);
            elementoMedia.innerText = media;
            elementoMedia.className = media !== '--' ? classificarGlicemia(media) : '';
        });

        const registrosParaExibir = obterRegistrosFiltrados();

        historicoList.innerHTML = '';
        registrosParaExibir.forEach((r) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <span style="display:block; margin-bottom:4px; font-size:0.85rem; color:#6b7280;">
                        ${r.data} (${r.hora}) - <strong>${formatarPeriodo(r.periodo)}</strong>
                    </span>
                    <strong class="${classificarGlicemia(r.valor)}" style="font-size:1.1rem;">
                        ${r.valor} mg/dL
                    </strong>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-editar" onclick="editarRegistro(${r.id})">Editar</button>
                    <button class="btn-excluir" onclick="deletarRegistro(${r.id})">Excluir</button>
                </div>
            `;
            historicoList.appendChild(li);
        });

        renderizarGrafico(registrosParaExibir);
    }

    window.deletarRegistro = function(id) {
        if(confirm('Tem certeza que deseja excluir este registro?')) {
            // Filtra removendo o ID e salva no armazenamento local
            registros = registros.filter(r => r.id !== id);
            salvarNoBancoLocal();
            atualizarDashboard();
        }
    }

    window.editarRegistro = function(id) {
        const registro = registros.find(r => r.id === id);
        if (!registro) return;

        const novoValorStr = prompt(`Corrigir valor (mg/dL) do dia ${registro.data}:`, registro.valor);
        if (novoValorStr === null || novoValorStr.trim() === '') return; 
        
        // Atualiza o valor e salva
        registro.valor = parseFloat(novoValorStr);
        salvarNoBancoLocal();
        atualizarDashboard(); 
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const valor = parseFloat(document.getElementById('valor').value);
        const periodo = document.getElementById('periodo').value;
        
        const dataInput = document.getElementById('data').value;
        const hora = document.getElementById('hora').value;
        
        const partesData = dataInput.split('-');
        const dataFormatada = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;

        // Cria o registro com um ID único baseado no relógio (timestamp)
        const novoRegistro = { 
            id: Date.now(), 
            valor, 
            periodo, 
            data: dataFormatada, 
            hora 
        };

        // Salva na memória do navegador
        registros.push(novoRegistro);
        salvarNoBancoLocal();
        
        form.reset();
        preencherDataHoraAtuais();
        
        document.getElementById('filtro-periodo').value = 'todos';
        document.getElementById('filtro-data').value = '7'; 
        
        atualizarDashboard();
    });

    document.getElementById('filtro-periodo').addEventListener('change', atualizarDashboard);
    document.getElementById('filtro-data').addEventListener('change', atualizarDashboard);

    document.getElementById('btn-exportar').addEventListener('click', () => {
        const registrosExportar = obterRegistrosFiltrados(); 

        if (registrosExportar.length === 0) {
            alert('Não há registros para exportar com os filtros atuais.');
            return;
        }

        let csvContent = "Data,Hora,Periodo,Valor (mg/dL)\n";
        registrosExportar.forEach(r => {
            csvContent += `${r.data},${r.hora},${formatarPeriodo(r.periodo)},${r.valor}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_glicemia.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Inicia a aplicação
    preencherDataHoraAtuais();
    atualizarDashboard();
});