export const json = {
    "pages": [
      {
        "name": "page1",
        "elements": [
          {
            "type": "rating",
            "name": "nps_score",
            "title": "En una escala del 0 al 10, cuán probable es que recomiendes a Hipódromo de Palermo?",
            "isRequired": true,
            "rateMin": 0,
            "rateMax": 10,
            "minRateDescription": "(No lo recomiendo)",
            "maxRateDescription": "(Muy recomendable)",
          }, {
            "type": "checkbox",
            "name": "promoter_features",
            "visibleIf": "{nps_score} >= 9",
            "title": "Qué de los siguientes ítems mas valoras de Hipódromo de Palermo",
            "description": "Por favor, seleccioná hasta tres opciones",
            "isRequired": true,
            "validators": [
              {
                "type": "answercount",
                "text": "Por favor, seleccioná hasta tres opciones",
                "maxCount": 3
              }
            ],
            "showOtherItem": false,
            "choices": [
              "Máquinas de Slots",
              "Gastronomía",
              "Estacionamiento",
              "Limpieza",
              "Seguridad",
              "Otros"
            ],
            
          }, {
            "type": "comment",
            "name": "prom_experience",
            "visibleIf": "{nps_score} >= 9",
            "title": "Por favor, dejanos un comentario para conocer tu experiencia",
            "isRequired": false,
          },
          {
            "type": "comment",
            "name": "passive_experience",
            "visibleIf": "{nps_score} >= 7  and {nps_score} <= 8",
            "title": "Qué podemos hacer para mejorar tu experiencia?",
            "isRequired": false,
          },
          {
            "type": "checkbox",
            "name": "disappointing_features",
            "visibleIf": "{nps_score} <= 6",
            "title": "Qué de los siguientes ítems hicieron que tu experiencia sea negativa",
            "description": "Por favor, seleccioná hasta tres opciones",
            "isRequired": true,
            "validators": [
              {
                "type": "answercount",
                "text": "Por favor, seleccioná tres opciones",
                "maxCount": 3
              }
            ],
            "showOtherItem": false,
            "choices": [
              "Máquinas de Slots",
              "Gastronomía",
              "Estacionamiento",
              "Limpieza",
              "Seguridad",
              "Otros"
            ],
          },
          {
            "type": "comment",
            "name": "disappointing_experience",
            "visibleIf": "{nps_score} <= 6",
            "title": "Por favor, dejanos un comentario para conocer tu experiencia",
            "isRequired": false,
          }
        ]
      }
    ],
    "completedHtml": "<h3>Gracias por tu respuesta! Nos ayuda a mejorar!</h3><h3 class='wp-txt'>Recordá que podes comunicarte con nosotros mientras disfrutas de nuestros slots accediento al QR que se encuentra en cada maquina</h3><div class='wp'></div>",
    "completedHtmlOnCondition": [
      {
        "expression": "{nps_score} >= 9",
        "html": "<h3>Gracias por tu respuesta!</h3> <h4>Estamos felices de que hayas tenido una buena experiencia!. Tus comentarios o sugerencias nos ayudan a mejorar!</h4><h3 class='wp-txt'>Recordá que podes comunicarte con nosotros mientras disfrutas de nuestros slots accediento al QR que se encuentra en cada maquina</h3><div class='wp'></div>"
      }, {
        "expression": "{nps_score} >= 6  and {nps_score} <= 8",
        "html": "<h3>Gracias por tu respuesta!</h3> <h4>Agradecemos que compartas tus ideas con nosotros, nos ayudará a mejorar!</h4><h3 class='wp-txt'>Recordá que podes comunicarte con nosotros mientras disfrutas de nuestros slots accediento al QR que se encuentra en cada maquina</h3><div class='wp'></div>"
      }
    ],
    "showQuestionNumbers": "off"
  };