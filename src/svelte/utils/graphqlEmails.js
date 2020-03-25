export async function envoiMail(arrayMails, infoMail) {
    const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
          method: "POST",
          body: JSON.stringify({
            query: `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelierdusappey@gmail.com"
                    to: $email
                    templateId: "d-3db7863e710b491e89681ccdf840a9f4"
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
                `,
            variables: {
              email: arrayMails,
              template: JSON.stringify(infoMail)
            }
          })
        }).then(async response => {
          let resultat = await response.json();
          console.log('retour envoi mail', resultat)
        });
        return true;
}